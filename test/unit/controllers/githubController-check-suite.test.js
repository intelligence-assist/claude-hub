// Set required environment variables BEFORE importing modules
process.env.BOT_USERNAME = '@TestBot';
process.env.NODE_ENV = 'test';
process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
process.env.GITHUB_TOKEN = 'test-token';

const githubController = require('../../../src/controllers/githubController');
const claudeService = require('../../../src/services/claudeService');

// Mock the Claude service
jest.mock('../../../src/services/claudeService', () => ({
  processCommand: jest.fn()
}));

describe('GitHub Controller - Check Suite Events', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      headers: {
        'x-github-event': 'check_suite',
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should trigger PR review when check suite succeeds with PRs', async () => {
    // Setup successful check suite with pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        id: 12345,
        conclusion: 'success',
        head_sha: 'abc123def456',
        head_branch: 'feature-branch',
        pull_requests: [
          {
            number: 42,
            head: {
              ref: 'feature-branch'
            }
          }
        ]
      },
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    // Mock Claude service to return success
    claudeService.processCommand.mockResolvedValue('PR review completed successfully');

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify Claude was called with PR review prompt
    expect(claudeService.processCommand).toHaveBeenCalledWith({
      repoFullName: 'owner/repo',
      issueNumber: 42,
      command: expect.stringContaining('## PR Review Workflow Instructions'),
      isPullRequest: true,
      branchName: 'feature-branch'
    });

    // Verify response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite completion processed - PR review triggered',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        pullRequests: [42]
      }
    });
  });

  it('should not trigger PR review when check suite fails', async () => {
    // Setup failed check suite with pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        id: 12345,
        conclusion: 'failure',
        pull_requests: [
          {
            number: 42,
            head: {
              ref: 'feature-branch'
            }
          }
        ]
      },
      repository: {
        full_name: 'owner/repo'
      }
    };

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify Claude was NOT called
    expect(claudeService.processCommand).not.toHaveBeenCalled();

    // Verify generic response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Webhook processed successfully'
    });
  });

  it('should not trigger PR review when check suite succeeds but has no PRs', async () => {
    // Setup successful check suite without pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        id: 12345,
        conclusion: 'success',
        pull_requests: []
      },
      repository: {
        full_name: 'owner/repo'
      }
    };

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify Claude was NOT called
    expect(claudeService.processCommand).not.toHaveBeenCalled();

    // Verify generic response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Webhook processed successfully'
    });
  });

  it('should handle multiple PRs in check suite', async () => {
    // Setup successful check suite with multiple pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        id: 12345,
        conclusion: 'success',
        pull_requests: [
          {
            number: 42,
            head: {
              ref: 'feature-branch-1'
            }
          },
          {
            number: 43,
            head: {
              ref: 'feature-branch-2'
            }
          }
        ]
      },
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    // Mock Claude service to return success
    claudeService.processCommand.mockResolvedValue('PR review completed successfully');

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify Claude was called twice, once for each PR
    expect(claudeService.processCommand).toHaveBeenCalledTimes(2);

    expect(claudeService.processCommand).toHaveBeenNthCalledWith(1, {
      repoFullName: 'owner/repo',
      issueNumber: 42,
      command: expect.stringContaining('## PR Review Workflow Instructions'),
      isPullRequest: true,
      branchName: 'feature-branch-1'
    });

    expect(claudeService.processCommand).toHaveBeenNthCalledWith(2, {
      repoFullName: 'owner/repo',
      issueNumber: 43,
      command: expect.stringContaining('## PR Review Workflow Instructions'),
      isPullRequest: true,
      branchName: 'feature-branch-2'
    });

    // Verify response includes both PR numbers
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite completion processed - PR review triggered',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        pullRequests: [42, 43]
      }
    });
  });

  it('should handle Claude service errors gracefully', async () => {
    // Setup successful check suite with pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        id: 12345,
        conclusion: 'success',
        head_sha: 'abc123def456',
        pull_requests: [
          {
            number: 42,
            head: {
              ref: 'feature-branch'
            }
          }
        ]
      },
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    // Mock Claude service to throw error
    claudeService.processCommand.mockRejectedValue(new Error('Claude service error'));

    await githubController.handleWebhook(mockReq, mockRes);

    // Should still return success response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite completion processed - PR review triggered',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        pullRequests: [42]
      }
    });
  });

  it('should use check suite head_sha when PR head.sha is missing', async () => {
    // Setup successful check suite with pull requests WITHOUT head.sha
    mockReq.body = {
      action: 'completed',
      check_suite: {
        id: 12345,
        conclusion: 'success',
        head_sha: 'check-suite-sha-123',
        head_branch: 'feature-branch',
        pull_requests: [
          {
            number: 42,
            // Note: head object exists but no sha property
            head: {
              ref: 'feature-branch'
            }
          }
        ]
      },
      repository: {
        full_name: 'owner/repo',
        owner: {
          login: 'owner'
        },
        name: 'repo'
      }
    };

    // Mock Claude service to return success
    claudeService.processCommand.mockResolvedValue('PR review completed successfully');

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify Claude was called with PR review prompt
    expect(claudeService.processCommand).toHaveBeenCalledWith({
      repoFullName: 'owner/repo',
      issueNumber: 42,
      command: expect.stringContaining('## PR Review Workflow Instructions'),
      isPullRequest: true,
      branchName: 'feature-branch'
    });

    // Verify response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite completion processed - PR review triggered',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        pullRequests: [42]
      }
    });
  });
});
