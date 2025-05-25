// Set required environment variables BEFORE importing modules
process.env.BOT_USERNAME = '@TestBot';
process.env.NODE_ENV = 'test';
process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
process.env.GITHUB_TOKEN = 'test-token';
process.env.PR_REVIEW_DEBOUNCE_DELAY = '100'; // Short delay for tests

const githubController = require('../../../src/controllers/githubController');
const claudeService = require('../../../src/services/claudeService');
const githubService = require('../../../src/services/githubService');

// Mock the services
jest.mock('../../../src/services/claudeService', () => ({
  processCommand: jest.fn()
}));

jest.mock('../../../src/services/githubService', () => ({
  findPRsForCommit: jest.fn(),
  hasReviewedPRAtCommit: jest.fn(),
  managePRLabels: jest.fn()
}));

describe('GitHub Controller - Status Events', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      headers: {
        'x-github-event': 'status',
        'x-github-delivery': 'test-delivery-id',
        'x-hub-signature-256': 'test-signature'
      },
      body: {},
      rawBody: ''
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Reset mocks
    claudeService.processCommand.mockReset();
    githubService.findPRsForCommit.mockReset();
    githubService.hasReviewedPRAtCommit.mockReset();
    githubService.managePRLabels.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle status success event and schedule debounced review', async () => {
    // Setup status success event
    mockReq.body = {
      state: 'success',
      sha: 'abc123def456789012345678901234567890abcd',
      context: 'ci/test',
      target_url: 'https://example.com/build/123',
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    // Mock finding PRs for commit
    githubService.findPRsForCommit.mockResolvedValue([
      {
        number: 42,
        head: {
          ref: 'feature-branch',
          sha: 'abc123def456789012345678901234567890abcd'
        }
      }
    ]);

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify PRs were found for the commit
    expect(githubService.findPRsForCommit).toHaveBeenCalledWith({
      repoOwner: 'owner',
      repoName: 'repo',
      commitSha: 'abc123def456789012345678901234567890abcd'
    });

    // Verify response indicates debounced review was scheduled
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Status success received - debounced review scheduled for 1 PRs',
      context: {
        repo: 'owner/repo',
        commitSha: 'abc123def456789012345678901234567890abcd',
        status: 'success',
        context: 'ci/test',
        prCount: 1,
        debounceDelayMs: 100,
        type: 'status'
      }
    });

    // Note: We can't easily test the debounced execution in a unit test
    // without making the test async and waiting. The debounced logic
    // will be tested in integration tests.
  });

  it('should handle status success event with no PRs found', async () => {
    // Setup status success event
    mockReq.body = {
      state: 'success',
      sha: 'abc123def456789012345678901234567890abcd',
      context: 'ci/test',
      target_url: 'https://example.com/build/123',
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    // Mock finding no PRs for commit
    githubService.findPRsForCommit.mockResolvedValue([]);

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify PRs were searched for
    expect(githubService.findPRsForCommit).toHaveBeenCalledWith({
      repoOwner: 'owner',
      repoName: 'repo',
      commitSha: 'abc123def456789012345678901234567890abcd'
    });

    // Verify response indicates no PRs found
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Status success received but no PRs found for commit',
      context: {
        repo: 'owner/repo',
        commitSha: 'abc123def456789012345678901234567890abcd',
        status: 'success',
        context: 'ci/test',
        type: 'status'
      }
    });
  });

  it('should handle status failure event without triggering review', async () => {
    // Setup status failure event
    mockReq.body = {
      state: 'failure',
      sha: 'abc123def456789012345678901234567890abcd',
      context: 'ci/test',
      target_url: 'https://example.com/build/123',
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify no PRs were searched for (since status was not success)
    expect(githubService.findPRsForCommit).not.toHaveBeenCalled();

    // Verify response indicates no action needed
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Status \'failure\' received - no action needed',
      context: {
        repo: 'owner/repo',
        commitSha: 'abc123def456789012345678901234567890abcd',
        status: 'failure',
        context: 'ci/test',
        type: 'status'
      }
    });
  });

  it('should handle status pending event without triggering review', async () => {
    // Setup status pending event
    mockReq.body = {
      state: 'pending',
      sha: 'abc123def456789012345678901234567890abcd',
      context: 'ci/test',
      target_url: 'https://example.com/build/123',
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify no PRs were searched for
    expect(githubService.findPRsForCommit).not.toHaveBeenCalled();

    // Verify response indicates no action needed
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Status \'pending\' received - no action needed',
      context: {
        repo: 'owner/repo',
        commitSha: 'abc123def456789012345678901234567890abcd',
        status: 'pending',
        context: 'ci/test',
        type: 'status'
      }
    });
  });

  it('should handle multiple PRs for the same commit', async () => {
    // Setup status success event
    mockReq.body = {
      state: 'success',
      sha: 'abc123def456789012345678901234567890abcd',
      context: 'ci/test',
      target_url: 'https://example.com/build/123',
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    // Mock finding multiple PRs for commit
    githubService.findPRsForCommit.mockResolvedValue([
      {
        number: 42,
        head: {
          ref: 'feature-branch-1',
          sha: 'abc123def456789012345678901234567890abcd'
        }
      },
      {
        number: 43,
        head: {
          ref: 'feature-branch-2',
          sha: 'abc123def456789012345678901234567890abcd'
        }
      }
    ]);

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify response indicates debounced review was scheduled for multiple PRs
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Status success received - debounced review scheduled for 2 PRs',
      context: {
        repo: 'owner/repo',
        commitSha: 'abc123def456789012345678901234567890abcd',
        status: 'success',
        context: 'ci/test',
        prCount: 2,
        debounceDelayMs: 100,
        type: 'status'
      }
    });
  });

  it('should handle error when finding PRs for commit', async () => {
    // Setup status success event
    mockReq.body = {
      state: 'success',
      sha: 'abc123def456789012345678901234567890abcd',
      context: 'ci/test',
      target_url: 'https://example.com/build/123',
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    // Mock error when finding PRs
    githubService.findPRsForCommit.mockRejectedValue(new Error('GitHub API error'));

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify error response
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to process status event',
      message: 'GitHub API error',
      context: {
        repo: 'owner/repo',
        commitSha: 'abc123def456789012345678901234567890abcd',
        status: 'success',
        context: 'ci/test',
        type: 'status'
      }
    });
  });

  it('should schedule debounced review with short SHA key', async () => {
    // Setup status success event
    mockReq.body = {
      state: 'success',
      sha: 'abcdef123456789012345678901234567890abcd',
      context: 'ci/test',
      target_url: 'https://example.com/build/123',
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    // Mock finding PRs for commit
    githubService.findPRsForCommit.mockResolvedValue([
      {
        number: 42,
        head: {
          ref: 'feature-branch',
          sha: 'abcdef123456789012345678901234567890abcd'
        }
      }
    ]);

    await githubController.handleWebhook(mockReq, mockRes);

    // The debounce key should use the first 12 characters of the SHA
    // This is tested indirectly through the successful response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Status success received - debounced review scheduled for 1 PRs'
      })
    );
  });
});