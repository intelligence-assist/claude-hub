// Set required environment variables BEFORE importing modules
process.env.BOT_USERNAME = '@TestBot';
process.env.NODE_ENV = 'test';
process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
process.env.GITHUB_TOKEN = 'test-token';

const githubController = require('../../../src/controllers/githubController');
const claudeService = require('../../../src/services/claudeService');
const githubService = require('../../../src/services/githubService');

// Mock the services
jest.mock('../../../src/services/claudeService', () => ({
  processCommand: jest.fn()
}));

jest.mock('../../../src/services/githubService', () => ({
  hasReviewedPRAtCommit: jest.fn(),
  managePRLabels: jest.fn()
}));

describe('Race Condition Prevention', () => {
  let mockReq1, mockReq2, mockReq3;
  let mockRes1, mockRes2, mockRes3;

  afterAll(() => {
    githubController.cleanup();
  });

  beforeEach(() => {
    // Create three identical webhook requests (simulating concurrent check_suite events)
    const baseRequest = {
      headers: {
        'x-github-event': 'check_suite',
        'x-github-delivery': 'test-delivery-id',
        'x-hub-signature-256': 'test-signature'
      },
      body: {
        action: 'completed',
        check_suite: {
          id: 99999,
          conclusion: 'success',
          head_sha: 'race-test-sha',
          head_branch: 'race-test-branch',
          pull_requests: [
            {
              number: 99,
              head: {
                ref: 'race-test-branch',
                sha: 'race-test-commit-sha'
              }
            }
          ]
        },
        repository: {
          full_name: 'test/race-condition',
          owner: {
            login: 'test'
          },
          name: 'race-condition'
        }
      },
      rawBody: ''
    };

    // Create three identical requests with different delivery IDs
    mockReq1 = { 
      ...baseRequest, 
      headers: { ...baseRequest.headers, 'x-github-delivery': 'delivery-1' }
    };
    mockReq2 = { 
      ...baseRequest, 
      headers: { ...baseRequest.headers, 'x-github-delivery': 'delivery-2' }
    };
    mockReq3 = { 
      ...baseRequest, 
      headers: { ...baseRequest.headers, 'x-github-delivery': 'delivery-3' }
    };

    mockRes1 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockRes2 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockRes3 = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    // Reset mocks
    claudeService.processCommand.mockReset();
    githubService.hasReviewedPRAtCommit.mockReset();
    githubService.managePRLabels.mockReset();
    
    // Clear the review cache
    githubController.clearReviewCache();
    
    // Mock that PR has not been reviewed yet
    githubService.hasReviewedPRAtCommit.mockResolvedValue(false);
    githubService.managePRLabels.mockResolvedValue();
    claudeService.processCommand.mockResolvedValue('Race condition test review completed');
  });

  it('should prevent duplicate reviews when processing concurrent check_suite events', async () => {
    // Simulate three concurrent webhook requests for the same PR and commit
    const promises = [
      githubController.handleWebhook(mockReq1, mockRes1),
      githubController.handleWebhook(mockReq2, mockRes2),
      githubController.handleWebhook(mockReq3, mockRes3)
    ];

    // Wait for all requests to complete
    await Promise.all(promises);

    // Verify that Claude was called exactly ONCE, not three times
    expect(claudeService.processCommand).toHaveBeenCalledTimes(1);

    // Verify that exactly one request resulted in a review, others were deduplicated
    const responseResults = [
      mockRes1.json.mock.calls[0]?.[0],
      mockRes2.json.mock.calls[0]?.[0], 
      mockRes3.json.mock.calls[0]?.[0]
    ];

    // Count how many resulted in successful reviews vs deduplicated
    const reviewedCount = responseResults.filter(result => 
      result?.message?.includes('1 reviewed')
    ).length;

    const deduplicatedCount = responseResults.filter(result =>
      result?.context?.results?.[0]?.skippedReason?.includes('already')
    ).length;

    // Exactly one should have been reviewed, the other two should be deduplicated
    expect(reviewedCount).toBe(1);
    expect(deduplicatedCount).toBe(2);

    // Verify that all requests returned 200 status
    expect(mockRes1.status).toHaveBeenCalledWith(200);
    expect(mockRes2.status).toHaveBeenCalledWith(200);
    expect(mockRes3.status).toHaveBeenCalledWith(200);
  });

  it('should use in-memory cache before GitHub API check for faster deduplication', async () => {
    // First request should process normally
    await githubController.handleWebhook(mockReq1, mockRes1);
    
    // Verify Claude was called once
    expect(claudeService.processCommand).toHaveBeenCalledTimes(1);
    expect(githubService.hasReviewedPRAtCommit).toHaveBeenCalledTimes(1);

    // Reset the GitHub API mock call count
    githubService.hasReviewedPRAtCommit.mockClear();

    // Second request should be deduplicated by cache, never reaching GitHub API
    await githubController.handleWebhook(mockReq2, mockRes2);

    // Verify Claude was still called only once total
    expect(claudeService.processCommand).toHaveBeenCalledTimes(1);
    
    // Verify GitHub API was NOT called for the second request (cache hit)
    expect(githubService.hasReviewedPRAtCommit).not.toHaveBeenCalled();

    // Verify second request was properly deduplicated
    const result2 = mockRes2.json.mock.calls[0]?.[0];
    expect(result2.context.results[0].skippedReason).toContain('Review already completed');
  });
});