/**
 * Integration test for GitHub webhook processing flow
 * 
 * This test verifies the integration between githubController, claudeService,
 * and githubService when processing GitHub webhook events.
 */

const { jest: jestGlobal } = require('@jest/globals');
const crypto = require('crypto');
const express = require('express');
const bodyParser = require('body-parser');
const request = require('supertest');

// Services
const claudeService = require('../../../src/services/claudeService');
const githubService = require('../../../src/services/githubService');
const secureCredentials = require('../../../src/utils/secureCredentials');

// Controller
const githubController = require('../../../src/controllers/githubController');

// Mock dependencies
jest.mock('../../../src/services/claudeService');
jest.mock('../../../src/services/githubService');

describe('GitHub Webhook Processing Integration', () => {
  let app;
  let originalEnv;
  
  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Create express app for testing
    app = express();
    app.use(bodyParser.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    
    // Add webhook route
    app.post('/api/webhooks/github', githubController.handleWebhook);
  });
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.BOT_USERNAME = '@TestBot';
    process.env.AUTHORIZED_USERS = 'testuser,admin';
    process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
    
    // Mock secureCredentials
    jest.spyOn(secureCredentials, 'get').mockImplementation(key => {
      if (key === 'GITHUB_WEBHOOK_SECRET') return 'test-webhook-secret';
      if (key === 'GITHUB_TOKEN') return 'github-test-token';
      if (key === 'ANTHROPIC_API_KEY') return 'claude-test-key';
      return null;
    });
    
    // Mock claudeService
    claudeService.processCommand.mockResolvedValue('Claude response for test command');
    
    // Mock githubService
    githubService.postComment.mockResolvedValue({
      id: 'test-comment-id',
      body: 'Claude response',
      created_at: new Date().toISOString()
    });
  });
  
  afterEach(() => {
    // Restore environment variables
    process.env = { ...originalEnv };
  });
  
  test('should process issue comment webhook with bot mention', async () => {
    // Create webhook payload for issue comment with bot mention
    const payload = {
      action: 'created',
      issue: { 
        number: 123,
        title: 'Test Issue',
        body: 'This is a test issue',
        user: { login: 'testuser' }
      },
      comment: {
        id: 456,
        body: '@TestBot help me with this issue',
        user: { login: 'testuser' }
      },
      repository: {
        full_name: 'test/repo',
        owner: { login: 'test' },
        name: 'repo'
      },
      sender: { login: 'testuser' }
    };
    
    // Calculate signature
    const payloadString = JSON.stringify(payload);
    const signature = 'sha256=' + 
      crypto.createHmac('sha256', 'test-webhook-secret')
        .update(payloadString)
        .digest('hex');
    
    // Send request to webhook endpoint
    const response = await request(app)
      .post('/api/webhooks/github')
      .set('X-GitHub-Event', 'issue_comment')
      .set('X-GitHub-Delivery', 'test-delivery-id')
      .set('X-Hub-Signature-256', signature)
      .send(payload);
    
    // Verify response
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    // Verify service calls
    expect(claudeService.processCommand).toHaveBeenCalledWith({
      repoFullName: 'test/repo',
      issueNumber: 123,
      command: 'help me with this issue',
      isPullRequest: false,
      branchName: null
    });
    
    expect(githubService.postComment).toHaveBeenCalledWith({
      repoOwner: 'test',
      repoName: 'repo',
      issueNumber: 123,
      body: 'Claude response for test command'
    });
  });
  
  test('should process pull request comment webhook', async () => {
    // Create webhook payload for PR comment with bot mention
    const payload = {
      action: 'created',
      issue: { 
        number: 456,
        title: 'Test PR',
        body: 'This is a test PR',
        user: { login: 'testuser' },
        pull_request: { url: 'https://api.github.com/repos/test/repo/pulls/456' }
      },
      comment: {
        id: 789,
        body: '@TestBot review this PR',
        user: { login: 'testuser' }
      },
      repository: {
        full_name: 'test/repo',
        owner: { login: 'test' },
        name: 'repo'
      },
      sender: { login: 'testuser' }
    };
    
    // Calculate signature
    const payloadString = JSON.stringify(payload);
    const signature = 'sha256=' + 
      crypto.createHmac('sha256', 'test-webhook-secret')
        .update(payloadString)
        .digest('hex');
    
    // Mock PR-specific GitHub service calls
    githubService.getPullRequestDetails.mockResolvedValue({
      number: 456,
      head: { ref: 'feature-branch' }
    });
    
    // Send request to webhook endpoint
    const response = await request(app)
      .post('/api/webhooks/github')
      .set('X-GitHub-Event', 'issue_comment')
      .set('X-GitHub-Delivery', 'test-delivery-id')
      .set('X-Hub-Signature-256', signature)
      .send(payload);
    
    // Verify response
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    // Verify PR details were retrieved
    expect(githubService.getPullRequestDetails).toHaveBeenCalledWith({
      repoOwner: 'test',
      repoName: 'repo',
      prNumber: 456
    });
    
    // Verify service calls with PR information
    expect(claudeService.processCommand).toHaveBeenCalledWith({
      repoFullName: 'test/repo',
      issueNumber: 456,
      command: 'review this PR',
      isPullRequest: true,
      branchName: 'feature-branch'
    });
    
    expect(githubService.postComment).toHaveBeenCalledWith({
      repoOwner: 'test',
      repoName: 'repo',
      issueNumber: 456,
      body: 'Claude response for test command'
    });
  });
  
  test('should reject webhook with invalid signature', async () => {
    // Create webhook payload
    const payload = {
      action: 'created',
      issue: { number: 123 },
      comment: {
        body: '@TestBot help me',
        user: { login: 'testuser' }
      },
      repository: {
        full_name: 'test/repo',
        owner: { login: 'test' },
        name: 'repo'
      },
      sender: { login: 'testuser' }
    };
    
    // Use invalid signature
    const invalidSignature = 'sha256=invalid_signature_value';
    
    // Send request with invalid signature
    const response = await request(app)
      .post('/api/webhooks/github')
      .set('X-GitHub-Event', 'issue_comment')
      .set('X-GitHub-Delivery', 'test-delivery-id')
      .set('X-Hub-Signature-256', invalidSignature)
      .send(payload);
    
    // Verify rejection
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid webhook signature');
    
    // Verify services were not called
    expect(claudeService.processCommand).not.toHaveBeenCalled();
    expect(githubService.postComment).not.toHaveBeenCalled();
  });
  
  test('should ignore comments without bot mention', async () => {
    // Create webhook payload without bot mention
    const payload = {
      action: 'created',
      issue: { number: 123 },
      comment: {
        body: 'This is a regular comment without bot mention',
        user: { login: 'testuser' }
      },
      repository: {
        full_name: 'test/repo',
        owner: { login: 'test' },
        name: 'repo'
      },
      sender: { login: 'testuser' }
    };
    
    // Calculate signature
    const payloadString = JSON.stringify(payload);
    const signature = 'sha256=' + 
      crypto.createHmac('sha256', 'test-webhook-secret')
        .update(payloadString)
        .digest('hex');
    
    // Send request to webhook endpoint
    const response = await request(app)
      .post('/api/webhooks/github')
      .set('X-GitHub-Event', 'issue_comment')
      .set('X-GitHub-Delivery', 'test-delivery-id')
      .set('X-Hub-Signature-256', signature)
      .send(payload);
    
    // Verify response
    expect(response.status).toBe(200);
    
    // Verify services were not called
    expect(claudeService.processCommand).not.toHaveBeenCalled();
    expect(githubService.postComment).not.toHaveBeenCalled();
  });
  
  test('should handle auto-tagging on new issue', async () => {
    // Create issue opened payload
    const payload = {
      action: 'opened',
      issue: { 
        number: 789,
        title: 'Bug in API endpoint',
        body: 'The /api/data endpoint returns a 500 error',
        user: { login: 'testuser' }
      },
      repository: {
        full_name: 'test/repo',
        owner: { login: 'test' },
        name: 'repo'
      },
      sender: { login: 'testuser' }
    };
    
    // Calculate signature
    const payloadString = JSON.stringify(payload);
    const signature = 'sha256=' + 
      crypto.createHmac('sha256', 'test-webhook-secret')
        .update(payloadString)
        .digest('hex');
    
    // Mock Claude service for auto-tagging
    claudeService.processCommand.mockResolvedValue('Added labels: bug, api, high-priority');
    
    // Mock GitHub service
    githubService.getFallbackLabels.mockReturnValue(['type:bug', 'priority:high', 'component:api']);
    githubService.addLabelsToIssue.mockResolvedValue([
      { name: 'type:bug' },
      { name: 'priority:high' },
      { name: 'component:api' }
    ]);
    
    // Send request to webhook endpoint
    const response = await request(app)
      .post('/api/webhooks/github')
      .set('X-GitHub-Event', 'issues')
      .set('X-GitHub-Delivery', 'test-delivery-id')
      .set('X-Hub-Signature-256', signature)
      .send(payload);
    
    // Verify response
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    // Verify Claude auto-tagging was called
    expect(claudeService.processCommand).toHaveBeenCalledWith(expect.objectContaining({
      repoFullName: 'test/repo',
      issueNumber: 789,
      operationType: 'auto-tagging'
    }));
  });
  
  test('should handle Claude service errors gracefully', async () => {
    // Create webhook payload
    const payload = {
      action: 'created',
      issue: { number: 123 },
      comment: {
        body: '@TestBot help me with this issue',
        user: { login: 'testuser' }
      },
      repository: {
        full_name: 'test/repo',
        owner: { login: 'test' },
        name: 'repo'
      },
      sender: { login: 'testuser' }
    };
    
    // Calculate signature
    const payloadString = JSON.stringify(payload);
    const signature = 'sha256=' + 
      crypto.createHmac('sha256', 'test-webhook-secret')
        .update(payloadString)
        .digest('hex');
    
    // Mock Claude service error
    claudeService.processCommand.mockRejectedValue(new Error('Claude service error'));
    
    // Send request to webhook endpoint
    const response = await request(app)
      .post('/api/webhooks/github')
      .set('X-GitHub-Event', 'issue_comment')
      .set('X-GitHub-Delivery', 'test-delivery-id')
      .set('X-Hub-Signature-256', signature)
      .send(payload);
    
    // Verify response
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    
    // Verify error was posted as comment
    expect(githubService.postComment).toHaveBeenCalledWith(expect.objectContaining({
      repoOwner: 'test',
      repoName: 'repo',
      issueNumber: 123,
      body: expect.stringContaining('Error processing command')
    }));
  });
});