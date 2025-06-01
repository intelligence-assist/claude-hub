// Set required environment variables BEFORE importing modules
process.env.BOT_USERNAME = '@TestBot';
process.env.NODE_ENV = 'test';
process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
process.env.GITHUB_TOKEN = 'test-token';
process.env.PR_REVIEW_TRIGGER_WORKFLOW = 'Pull Request CI';
process.env.PR_REVIEW_DEBOUNCE_MS = '0'; // Disable debounce for tests
process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS = 'false'; // Use trigger workflow mode for tests

const githubController =
  require('../../../src/controllers/githubController').default ||
  require('../../../src/controllers/githubController');
const claudeService =
  require('../../../src/services/claudeService').default ||
  require('../../../src/services/claudeService');
const githubService =
  require('../../../src/services/githubService').default ||
  require('../../../src/services/githubService');

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
  managePRLabels: jest.fn(),
  getCheckSuitesForRef: jest.fn()
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
    githubService.getCombinedStatus.mockReset();
    githubService.postComment.mockReset();
    githubService.addLabelsToIssue.mockReset();
    githubService.getFallbackLabels.mockReset();
    githubService.hasReviewedPRAtCommit.mockReset();
    githubService.managePRLabels.mockReset();
    githubService.getCheckSuitesForRef.mockReset();

    // Mock the check runs API response to return the expected workflow name
    githubService.getCheckSuitesForRef.mockResolvedValue({
      check_runs: [{ name: 'Pull Request CI' }]
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should trigger PR review when check suite succeeds with PRs and combined status passes', async () => {
    // Use specific workflow trigger for this test
    process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS = 'false';
    // Setup successful check suite with pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        app: {
          slug: 'github-actions',
          name: 'GitHub Actions'
        },
        id: 12345,
        conclusion: 'success',
        head_sha: 'abc123def456',
        head_branch: 'feature-branch',
        check_runs_url: 'https://api.github.com/repos/owner/repo/check-suites/12345/check-runs',
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

    // Mock workflow name extraction to match PR_REVIEW_TRIGGER_WORKFLOW
    githubService.getCheckSuitesForRef.mockResolvedValue({
      check_runs: [{ name: 'Pull Request CI' }]
    });

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
      branchName: 'feature-branch',
      operationType: 'pr-review'
    });

    // Verify simple success response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Webhook processed successfully'
    });
  });

  it('should not trigger PR review when check suite fails', async () => {
    // Setup failed check suite with pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        app: {
          slug: 'github-actions',
          name: 'GitHub Actions'
        },
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

    // Verify response for failed check suite
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Check suite not successful'
    });
  });

  it('should not trigger PR review when check suite succeeds but has no PRs', async () => {
    // Setup successful check suite without pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        app: {
          slug: 'github-actions',
          name: 'GitHub Actions'
        },
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

    // Verify response for check suite without PRs
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'No pull requests associated with check suite'
    });
  });

  it('should handle multiple PRs in check suite in parallel', async () => {
    // Use wait for all checks mode for this test
    process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS = 'true';
    // Setup successful check suite with multiple pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        app: {
          slug: 'github-actions',
          name: 'GitHub Actions'
        },
        id: 12345,
        conclusion: 'success',
        head_sha: 'check-suite-sha',
        check_runs_url: 'https://api.github.com/repos/owner/repo/check-suites/12345/check-runs',
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

    // Mock that all check suites are complete and successful
    githubService.getCheckSuitesForRef.mockResolvedValue({
      check_suites: [
        {
          id: 12345,
          app: { name: 'GitHub Actions' },
          status: 'completed',
          conclusion: 'success'
        }
      ]
    });

    // Mock that neither PR has been reviewed yet
    githubService.hasReviewedPRAtCommit.mockResolvedValue(false);

    // Mock label management
    githubService.managePRLabels.mockResolvedValue();

    // Mock Claude service to return success
    claudeService.processCommand.mockResolvedValue('PR review completed successfully');

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify both PRs were checked for existing reviews
    expect(githubService.hasReviewedPRAtCommit).toHaveBeenCalledTimes(2);

    // Verify Claude was called twice, once for each PR
    expect(claudeService.processCommand).toHaveBeenCalledTimes(2);

    // Verify simplified success response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Webhook processed successfully'
    });
  });

  it('should handle Claude service errors gracefully', async () => {
    // Use wait for all checks mode for this test
    process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS = 'true';
    // Setup successful check suite with pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        app: {
          slug: 'github-actions',
          name: 'GitHub Actions'
        },
        id: 12345,
        conclusion: 'success',
        head_sha: 'abc123def456',
        check_runs_url: 'https://api.github.com/repos/owner/repo/check-suites/12345/check-runs',
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

    // Mock that all check suites are complete and successful
    githubService.getCheckSuitesForRef.mockResolvedValue({
      check_suites: [
        {
          id: 12345,
          app: { name: 'GitHub Actions' },
          status: 'completed',
          conclusion: 'success'
        }
      ]
    });

    // Mock that PR has not been reviewed yet
    githubService.hasReviewedPRAtCommit.mockResolvedValue(false);

    // Mock label management
    githubService.managePRLabels.mockResolvedValue();

    // Mock Claude service to throw error
    claudeService.processCommand.mockRejectedValue(new Error('Claude service error'));

    await githubController.handleWebhook(mockReq, mockRes);

    // Should still return success response (webhook processing succeeded)
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Webhook processed successfully'
    });
  });

  it('should not trigger when workflow does not match', async () => {
    // Set environment to use specific workflow trigger
    process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS = 'false';
    // Setup check suite that looks successful but doesn't match our trigger workflow
    mockReq.body = {
      action: 'completed',
      check_suite: {
        app: {
          slug: 'github-advanced-security',
          name: 'GitHub Advanced Security'
        },
        id: 12345,
        conclusion: 'success',
        head_sha: 'check-suite-sha-123',
        head_branch: 'feature-branch',
        check_runs_url: 'https://api.github.com/repos/owner/repo/check-suites/12345/check-runs',
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

    // Mock workflow name that doesn't match our trigger
    githubService.getCheckSuitesForRef.mockResolvedValue({
      check_runs: [
        { name: 'CodeQL Analysis' } // Different workflow than 'Pull Request CI'
      ]
    });

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify Claude was NOT called because workflow doesn't match
    expect(claudeService.processCommand).not.toHaveBeenCalled();

    // Verify simple success response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Webhook processed successfully'
    });
  });

  it('should skip PR review when not all check suites are complete', async () => {
    // Use wait for all checks mode for this test
    process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS = 'true';

    // Setup successful check suite with pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        app: {
          slug: 'github-actions',
          name: 'GitHub Actions'
        },
        id: 12345,
        conclusion: 'success',
        head_sha: 'abc123def456',
        head_branch: 'feature-branch',
        check_runs_url: 'https://api.github.com/repos/owner/repo/check-suites/12345/check-runs',
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

    // Mock that some check suites are still in progress
    githubService.getCheckSuitesForRef.mockResolvedValue({
      check_suites: [
        {
          id: 12345,
          app: { name: 'GitHub Actions' },
          status: 'completed',
          conclusion: 'success'
        },
        {
          id: 12346,
          app: { name: 'CodeQL' },
          status: 'in_progress',
          conclusion: null
        }
      ]
    });

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify check suites were queried
    expect(githubService.getCheckSuitesForRef).toHaveBeenCalled();

    // Verify Claude was NOT called because not all checks are complete
    expect(claudeService.processCommand).not.toHaveBeenCalled();

    // Verify simple success response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Webhook processed successfully'
    });
  });

  it('should handle check suites API errors gracefully', async () => {
    // Use wait for all checks mode for this test
    process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS = 'true';

    // Setup successful check suite with pull requests
    mockReq.body = {
      action: 'completed',
      check_suite: {
        app: {
          slug: 'github-actions',
          name: 'GitHub Actions'
        },
        id: 12345,
        conclusion: 'success',
        head_sha: 'abc123def456',
        head_branch: 'feature-branch',
        check_runs_url: 'https://api.github.com/repos/owner/repo/check-suites/12345/check-runs',
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

    // Mock getCheckSuitesForRef to throw error
    githubService.getCheckSuitesForRef.mockRejectedValue(new Error('GitHub API error'));

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify Claude was NOT called due to API error
    expect(claudeService.processCommand).not.toHaveBeenCalled();

    // Verify simple success response (webhook processing succeeded even if check suites query failed)
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Webhook processed successfully'
    });
  });

  it('should skip PR review when already reviewed at same commit', async () => {
    // Use specific workflow trigger for this test
    process.env.PR_REVIEW_WAIT_FOR_ALL_CHECKS = 'false';

    // Setup successful check suite with pull request
    mockReq.body = {
      action: 'completed',
      check_suite: {
        app: {
          slug: 'github-actions',
          name: 'GitHub Actions'
        },
        id: 12345,
        conclusion: 'success',
        head_sha: 'abc123def456',
        head_branch: 'feature-branch',
        check_runs_url: 'https://api.github.com/repos/owner/repo/check-suites/12345/check-runs',
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

    // Mock workflow name extraction to match PR_REVIEW_TRIGGER_WORKFLOW
    githubService.getCheckSuitesForRef.mockResolvedValue({
      check_runs: [{ name: 'Pull Request CI' }]
    });

    // Mock that PR has already been reviewed at this commit
    githubService.hasReviewedPRAtCommit.mockResolvedValue(true);

    await githubController.handleWebhook(mockReq, mockRes);

    // Verify PR was checked for existing review
    expect(githubService.hasReviewedPRAtCommit).toHaveBeenCalledWith({
      repoOwner: 'owner',
      repoName: 'repo',
      prNumber: 42,
      commitSha: 'pr-sha-123'
    });

    // Verify Claude was NOT called since already reviewed
    expect(claudeService.processCommand).not.toHaveBeenCalled();

    // Verify simple success response
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Webhook processed successfully'
    });
  });
});
