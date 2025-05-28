const SignatureHelper = require('../../utils/signatureHelper');

// Set required environment variables before requiring modules
process.env.BOT_USERNAME = '@TestBot';
process.env.NODE_ENV = 'test';
process.env.GITHUB_TOKEN = 'test_token';
process.env.AUTHORIZED_USERS = 'testuser,admin';

// Mock secureCredentials before requiring actual modules
jest.mock('../../../src/utils/secureCredentials', () => ({
  get: jest.fn(key => {
    const mockCredentials = {
      GITHUB_WEBHOOK_SECRET: 'test_secret',
      GITHUB_TOKEN: 'test_token',
      ANTHROPIC_API_KEY: 'test_anthropic_key'
    };
    return mockCredentials[key] || null;
  }),
  has: jest.fn(key => {
    const mockCredentials = {
      GITHUB_WEBHOOK_SECRET: 'test_secret',
      GITHUB_TOKEN: 'test_token',
      ANTHROPIC_API_KEY: 'test_anthropic_key'
    };
    return !!mockCredentials[key];
  })
}));

// Mock services before requiring actual modules
jest.mock('../../../src/services/claudeService', () => ({
  processCommand: jest.fn().mockResolvedValue('Claude response')
}));

jest.mock('../../../src/services/githubService', () => ({
  postComment: jest.fn().mockResolvedValue({ id: 456 })
}));

// Now require modules after environment and mocks are set up
const githubController =
  require('../../../src/controllers/githubController').default ||
  require('../../../src/controllers/githubController');
const claudeService =
  require('../../../src/services/claudeService').default ||
  require('../../../src/services/claudeService');
const githubService =
  require('../../../src/services/githubService').default ||
  require('../../../src/services/githubService');

describe('GitHub Controller', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create request and response mocks
    req = {
      headers: {
        'x-github-event': 'issue_comment',
        'x-hub-signature-256': '',
        'x-github-delivery': 'test-delivery-id'
      },
      body: {
        action: 'created',
        comment: {
          body: '@TestBot Tell me about this repository',
          id: 123456,
          user: {
            login: 'testuser'
          }
        },
        issue: {
          number: 123
        },
        repository: {
          full_name: 'owner/repo',
          name: 'repo',
          owner: {
            login: 'owner'
          }
        },
        sender: {
          login: 'testuser'
        }
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Mock the environment variables
    process.env.GITHUB_WEBHOOK_SECRET = 'test_secret';

    // Set up the signature using the helper
    req.headers['x-hub-signature-256'] = SignatureHelper.createGitHubSignature(
      req.body,
      process.env.GITHUB_WEBHOOK_SECRET
    );

    // Mock successful responses from services
    claudeService.processCommand.mockResolvedValue('Claude response');
    githubService.postComment.mockResolvedValue({ id: 456 });
  });

  test('should process a valid webhook with @TestBot mention', async () => {
    await githubController.handleWebhook(req, res);

    // Verify that Claude service was called with correct parameters
    expect(claudeService.processCommand).toHaveBeenCalledWith({
      repoFullName: 'owner/repo',
      issueNumber: 123,
      command: 'Tell me about this repository',
      isPullRequest: false,
      branchName: null
    });

    // Verify that GitHub service was called to post a comment
    expect(githubService.postComment).toHaveBeenCalledWith({
      repoOwner: 'owner',
      repoName: 'repo',
      issueNumber: 123,
      body: 'Claude response'
    });

    // Verify response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Command processed and response posted'
      })
    );
  });

  test('should reject a webhook with invalid signature', async () => {
    // Tamper with the signature
    req.headers['x-hub-signature-256'] = 'sha256=invalid_signature';

    // Reset mocks before test
    jest.clearAllMocks();

    // Set NODE_ENV to production for this test to enable signature verification
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    await githubController.handleWebhook(req, res);

    // Restore NODE_ENV
    process.env.NODE_ENV = originalNodeEnv;

    // Verify that services were not called
    expect(claudeService.processCommand).not.toHaveBeenCalled();
    expect(githubService.postComment).not.toHaveBeenCalled();

    // Verify response
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid webhook signature'
      })
    );
  });

  test('should ignore comments without @TestBot mention', async () => {
    // Remove the @TestBot mention
    req.body.comment.body = 'This is a regular comment';

    // Update the signature using the helper
    req.headers['x-hub-signature-256'] = SignatureHelper.createGitHubSignature(
      req.body,
      process.env.GITHUB_WEBHOOK_SECRET
    );

    await githubController.handleWebhook(req, res);

    // Verify that services were not called
    expect(claudeService.processCommand).not.toHaveBeenCalled();
    expect(githubService.postComment).not.toHaveBeenCalled();

    // Verify response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Webhook processed successfully' });
  });

  test('should handle errors from Claude service', async () => {
    // Make Claude service throw an error
    claudeService.processCommand.mockRejectedValue(new Error('Claude error'));

    await githubController.handleWebhook(req, res);

    // Verify that GitHub service was called to post an error comment
    expect(githubService.postComment).toHaveBeenCalledWith(
      expect.objectContaining({
        repoOwner: 'owner',
        repoName: 'repo',
        issueNumber: 123,
        body: expect.stringContaining('An error occurred while processing your command')
      })
    );

    // Verify response
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to process command'
      })
    );
  });
});
