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
  getCombinedStatus: jest.fn(),
  postComment: jest.fn(),
  addLabelsToIssue: jest.fn(),
  getFallbackLabels: jest.fn(),
  hasReviewedPRAtCommit: jest.fn(),
  managePRLabels: jest.fn()
}));

describe('GitHub Controller - Check Suite Events', () => {
  let mockReq;
  let mockRes;

  afterAll(() => {
    githubController.cleanup();
  });

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
    githubService.getCombinedStatus.mockReset();
    githubService.postComment.mockReset();
    githubService.addLabelsToIssue.mockReset();
    githubService.getFallbackLabels.mockReset();
    githubService.hasReviewedPRAtCommit.mockReset();
    githubService.managePRLabels.mockReset();
    
    // Clear the review cache to prevent test interference
    githubController.clearReviewCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should trigger PR review when check suite succeeds with PRs and combined status passes', async () => {
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
              ref: 'feature-branch',
              sha: 'pr-sha-123'
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

    // Mock that PR has not been reviewed yet
    githubService.hasReviewedPRAtCommit.mockResolvedValue(false);
    
    // Mock label management
    githubService.managePRLabels.mockResolvedValue();

    // Mock Claude service to return success
    claudeService.processCommand.mockResolvedValue('PR review completed successfully');

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify PR was checked for existing review
    expect(githubService.hasReviewedPRAtCommit).toHaveBeenCalledWith({
      repoOwner: 'owner',
      repoName: 'repo',
      prNumber: 42,
      commitSha: 'pr-sha-123'
    });
    
    // Verify labels were managed (in-progress and complete)
    expect(githubService.managePRLabels).toHaveBeenCalledTimes(2);
    expect(githubService.managePRLabels).toHaveBeenCalledWith({
      repoOwner: 'owner',
      repoName: 'repo',
      prNumber: 42,
      labelsToAdd: ['claude-review-in-progress'],
      labelsToRemove: ['claude-review-needed', 'claude-review-complete']
    });
    expect(githubService.managePRLabels).toHaveBeenCalledWith({
      repoOwner: 'owner',
      repoName: 'repo',  
      prNumber: 42,
      labelsToAdd: ['claude-review-complete'],
      labelsToRemove: ['claude-review-in-progress', 'claude-review-needed']
    });

    // Verify Claude was called with PR review prompt
    expect(claudeService.processCommand).toHaveBeenCalledWith({
      repoFullName: 'owner/repo',
      issueNumber: 42,
      command: expect.stringContaining('# GitHub PR Review - Complete Automated Review'),
      isPullRequest: true,
      branchName: 'feature-branch'
    });

    // Verify response with detailed results
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite processed: 1 reviewed, 0 failed, 0 skipped',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        results: [
          {
            prNumber: 42,
            success: true,
            error: null,
            skippedReason: null
          }
        ]
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

  it('should handle multiple PRs in check suite in parallel', async () => {
    // Setup successful check suite with multiple pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        id: 12345,
        conclusion: 'success',
        head_sha: 'check-suite-sha',
        pull_requests: [
          {
            number: 42,
            head: {
              ref: 'feature-branch-1',
              sha: 'pr42-sha'
            }
          },
          {
            number: 43,
            head: {
              ref: 'feature-branch-2',
              sha: 'pr43-sha'
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

    // Mock that neither PR has been reviewed yet
    githubService.hasReviewedPRAtCommit.mockResolvedValue(false);
    
    // Mock label management
    githubService.managePRLabels.mockResolvedValue();

    // Mock Claude service to return success
    claudeService.processCommand.mockResolvedValue('PR review completed successfully');

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify both PRs were checked for existing reviews
    expect(githubService.hasReviewedPRAtCommit).toHaveBeenCalledTimes(2);
    expect(githubService.hasReviewedPRAtCommit).toHaveBeenCalledWith({
      repoOwner: 'owner',
      repoName: 'repo',
      prNumber: 42,
      commitSha: 'pr42-sha'
    });
    expect(githubService.hasReviewedPRAtCommit).toHaveBeenCalledWith({
      repoOwner: 'owner',
      repoName: 'repo',
      prNumber: 43,
      commitSha: 'pr43-sha'
    });
    
    // Verify labels were managed for both PRs
    expect(githubService.managePRLabels).toHaveBeenCalledTimes(4); // 2 PRs * 2 calls each

    // Verify Claude was called twice, once for each PR
    expect(claudeService.processCommand).toHaveBeenCalledTimes(2);

    // Verify response includes detailed results for both PRs
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite processed: 2 reviewed, 0 failed, 0 skipped',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        results: [
          {
            prNumber: 42,
            success: true,
            error: null,
            skippedReason: null
          },
          {
            prNumber: 43,
            success: true,
            error: null,
            skippedReason: null
          }
        ]
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
              ref: 'feature-branch',
              sha: 'error-test-sha-456'
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

    // Mock that PR has not been reviewed yet
    githubService.hasReviewedPRAtCommit.mockResolvedValue(false);
    
    // Mock label management
    githubService.managePRLabels.mockResolvedValue();

    // Mock Claude service to throw error
    claudeService.processCommand.mockRejectedValue(new Error('Claude service error'));

    await githubController.handleWebhook(mockReq, mockRes);

    // Should still return success response but with failure details
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite processed: 0 reviewed, 1 failed, 0 skipped',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        results: [
          {
            prNumber: 42,
            success: false,
            error: 'Claude service error',
            skippedReason: null
          }
        ]
      }
    });
  });

  it('should skip PR when head.sha is missing', async () => {
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

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify combined status was NOT checked
    expect(githubService.getCombinedStatus).not.toHaveBeenCalled();

    // Verify Claude was NOT called
    expect(claudeService.processCommand).not.toHaveBeenCalled();

    // Verify response indicates PR was skipped
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite processed: 0 reviewed, 0 failed, 1 skipped',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        results: [
          {
            prNumber: 42,
            success: false,
            error: 'Missing PR head SHA',
            skippedReason: 'No commit SHA available'
          }
        ]
      }
    });
  });

  it.skip('should skip PR review when combined status is not success', async () => {
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
              ref: 'feature-branch',
              sha: 'pr-sha-123'
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

    // Mock combined status to return pending
    githubService.getCombinedStatus.mockResolvedValue({
      state: 'pending',
      total_count: 5,
      statuses: [
        { context: 'build', state: 'success', description: 'Build passed' },
        { context: 'tests', state: 'pending', description: 'Tests running' }
      ]
    });

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify combined status was checked
    expect(githubService.getCombinedStatus).toHaveBeenCalled();

    // Verify Claude was NOT called
    expect(claudeService.processCommand).not.toHaveBeenCalled();

    // Verify response indicates PR was skipped
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite processed: 0 reviewed, 0 failed, 1 skipped',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        results: [
          {
            prNumber: 42,
            success: false,
            error: null,
            skippedReason: 'Combined status is pending'
          }
        ]
      }
    });
  });

  it.skip('should handle combined status API errors', async () => {
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
              ref: 'feature-branch',
              sha: 'pr-sha-123'
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

    // Mock combined status to throw error
    githubService.getCombinedStatus.mockRejectedValue(new Error('GitHub API error'));

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify Claude was NOT called
    expect(claudeService.processCommand).not.toHaveBeenCalled();

    // Verify response indicates failure
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite processed: 0 reviewed, 0 failed, 1 skipped',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        results: [
          {
            prNumber: 42,
            success: false,
            error: 'Failed to check status: GitHub API error',
            skippedReason: 'Status check failed'
          }
        ]
      }
    });
  });

  it('should handle mixed success and failure in multiple PRs', async () => {
    // Setup successful check suite with multiple pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        id: 12345,
        conclusion: 'success',
        head_sha: 'check-suite-sha',
        pull_requests: [
          {
            number: 42,
            head: {
              ref: 'feature-branch-1',
              sha: 'pr42-sha'
            }
          },
          {
            number: 43,
            head: {
              ref: 'feature-branch-2',
              sha: 'pr43-sha'
            }
          },
          {
            number: 44,
            head: {
              ref: 'feature-branch-3'
              // Missing SHA
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

    // Mock that PRs have not been reviewed yet
    githubService.hasReviewedPRAtCommit.mockResolvedValue(false);
    
    // Mock label management
    githubService.managePRLabels.mockResolvedValue();

    // Mock Claude service to succeed for PRs with valid SHA
    claudeService.processCommand.mockResolvedValue('PR review completed successfully');

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify all PRs were checked for existing reviews (including the one without SHA)
    expect(githubService.hasReviewedPRAtCommit).toHaveBeenCalledTimes(2);

    // Verify Claude was called for both PRs with valid SHA
    expect(claudeService.processCommand).toHaveBeenCalledTimes(2);
    expect(claudeService.processCommand).toHaveBeenCalledWith({
      repoFullName: 'owner/repo',
      issueNumber: 42,
      command: expect.stringContaining('# GitHub PR Review - Complete Automated Review'),
      isPullRequest: true,
      branchName: 'feature-branch-1'
    });
    expect(claudeService.processCommand).toHaveBeenCalledWith({
      repoFullName: 'owner/repo',
      issueNumber: 43,
      command: expect.stringContaining('# GitHub PR Review - Complete Automated Review'),
      isPullRequest: true,
      branchName: 'feature-branch-2'
    });

    // Verify response with mixed results
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite processed: 2 reviewed, 0 failed, 1 skipped',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        results: [
          {
            prNumber: 42,
            success: true,
            error: null,
            skippedReason: null
          },
          {
            prNumber: 43,
            success: true,
            error: null,
            skippedReason: null
          },
          {
            prNumber: 44,
            success: false,
            error: 'Missing PR head SHA',
            skippedReason: 'No commit SHA available'
          }
        ]
      }
    });
  });

  it('should skip PR review when already reviewed at same commit', async () => {
    // Setup successful check suite with pull request
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
              ref: 'feature-branch',
              sha: 'already-reviewed-sha-789'
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

    // Mock that PR has already been reviewed at this commit
    githubService.hasReviewedPRAtCommit.mockResolvedValue(true);

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify PR was checked for existing review
    expect(githubService.hasReviewedPRAtCommit).toHaveBeenCalledWith({
      repoOwner: 'owner',
      repoName: 'repo',
      prNumber: 42,
      commitSha: 'already-reviewed-sha-789'
    });
    
    // Verify no labels were added (review was skipped)
    expect(githubService.managePRLabels).not.toHaveBeenCalled();

    // Verify Claude was NOT called
    expect(claudeService.processCommand).not.toHaveBeenCalled();

    // Verify response indicates PR was skipped
    expect(mockRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Check suite processed: 0 reviewed, 0 failed, 1 skipped',
      context: {
        repo: 'owner/repo',
        checkSuite: 12345,
        conclusion: 'success',
        results: [
          {
            prNumber: 42,
            success: false,
            error: null,
            skippedReason: 'Already reviewed at this commit'
          }
        ]
      }
    });
  });
});
