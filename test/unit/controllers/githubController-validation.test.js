// Tests for webhook validation and error handling in GitHub controller
process.env.BOT_USERNAME = '@TestBot';
process.env.NODE_ENV = 'test';
process.env.AUTHORIZED_USERS = 'testuser,admin';

// Mock dependencies
jest.mock('../../../src/services/claudeService', () => ({
  processCommand: jest.fn()
}));

jest.mock('../../../src/services/githubService', () => ({
  postComment: jest.fn(),
  addLabelsToIssue: jest.fn(),
  getFallbackLabels: jest.fn().mockReturnValue(['bug']),
  hasReviewedPRAtCommit: jest.fn(),
  getCheckSuitesForRef: jest.fn(),
  managePRLabels: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

jest.mock('../../../src/utils/sanitize', () => ({
  sanitizeBotMentions: jest.fn(input => input)
}));

jest.mock('../../../src/utils/secureCredentials', () => ({
  get: jest.fn(key => {
    if (key === 'GITHUB_WEBHOOK_SECRET') return 'test-secret';
    return null;
  })
}));

const { handleWebhook } = require('../../../src/controllers/githubController');
const { processCommand } = require('../../../src/services/claudeService');
const { getFallbackLabels, addLabelsToIssue } = require('../../../src/services/githubService');

describe('GitHub Controller - Webhook Validation', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('Webhook payload validation', () => {
    it('should reject requests with missing body', async () => {
      mockReq = {
        headers: {
          'x-github-event': 'issues',
          'x-github-delivery': 'test-delivery'
        },
        body: null
      };

      await handleWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Missing or invalid request body'
      });
    });

    it('should reject requests with non-object body', async () => {
      mockReq = {
        headers: {
          'x-github-event': 'issues',
          'x-github-delivery': 'test-delivery'
        },
        body: 'invalid-string-body'
      };

      await handleWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Missing or invalid request body'
      });
    });

    it('should accept valid webhook payloads', async () => {
      mockReq = {
        headers: {
          'x-github-event': 'ping',
          'x-github-delivery': 'test-delivery'
        },
        body: {
          zen: 'Non-blocking is better than blocking.',
          hook_id: 12345
        }
      };

      await handleWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Webhook processed successfully'
      });
    });
  });

  describe('Issue auto-tagging with fallback', () => {
    it('should use fallback labeling when Claude tagging fails', async () => {
      processCommand.mockResolvedValueOnce('error: failed to connect to GitHub API');

      mockReq = {
        headers: {
          'x-github-event': 'issues',
          'x-github-delivery': 'test-delivery'
        },
        body: {
          action: 'opened',
          repository: {
            full_name: 'owner/repo',
            name: 'repo',
            owner: { login: 'owner' }
          },
          issue: {
            number: 123,
            title: 'Critical bug in authentication system',
            body: 'Users cannot login after latest update',
            user: { login: 'reporter' }
          }
        }
      };

      await handleWebhook(mockReq, mockRes);

      // Should attempt Claude tagging first
      expect(processCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'auto-tagging'
        })
      );

      // Should fall back to keyword-based labeling
      expect(getFallbackLabels).toHaveBeenCalledWith(
        'Critical bug in authentication system',
        'Users cannot login after latest update'
      );

      expect(addLabelsToIssue).toHaveBeenCalledWith({
        repoOwner: 'owner',
        repoName: 'repo',
        issueNumber: 123,
        labels: ['bug']
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should handle missing issue data gracefully', async () => {
      mockReq = {
        headers: {
          'x-github-event': 'issues',
          'x-github-delivery': 'test-delivery'
        },
        body: {
          action: 'opened',
          repository: {
            full_name: 'owner/repo',
            name: 'repo',
            owner: { login: 'owner' }
          }
          // Missing issue data
        }
      };

      await handleWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Issue data is missing from payload'
      });
    });
  });

  describe('User authorization', () => {
    it('should allow authorized users to trigger commands', async () => {
      processCommand.mockResolvedValueOnce('Command executed successfully');

      mockReq = {
        headers: {
          'x-github-event': 'issue_comment',
          'x-github-delivery': 'test-delivery'
        },
        body: {
          action: 'created',
          repository: {
            full_name: 'owner/repo',
            name: 'repo',
            owner: { login: 'owner' }
          },
          issue: {
            number: 123,
            user: { login: 'issueauthor' }
          },
          comment: {
            id: 456,
            body: '@TestBot help with this issue',
            user: { login: 'admin' } // authorized user
          }
        }
      };

      await handleWebhook(mockReq, mockRes);

      expect(processCommand).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should reject unauthorized users with helpful message', async () => {
      mockReq = {
        headers: {
          'x-github-event': 'issue_comment',
          'x-github-delivery': 'test-delivery'
        },
        body: {
          action: 'created',
          repository: {
            full_name: 'owner/repo',
            name: 'repo',
            owner: { login: 'owner' }
          },
          issue: {
            number: 123,
            user: { login: 'issueauthor' }
          },
          comment: {
            id: 456,
            body: '@TestBot help with this issue',
            user: { login: 'unauthorized_user' }
          }
        }
      };

      await handleWebhook(mockReq, mockRes);

      expect(processCommand).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Unauthorized user - command ignored'
        })
      );
    });
  });

  describe('Error recovery and user feedback', () => {
    it('should provide helpful error messages when commands fail', async () => {
      const testError = new Error('Claude API rate limit exceeded');
      processCommand.mockRejectedValueOnce(testError);

      mockReq = {
        headers: {
          'x-github-event': 'issue_comment',
          'x-github-delivery': 'test-delivery'
        },
        body: {
          action: 'created',
          repository: {
            full_name: 'owner/repo',
            name: 'repo',
            owner: { login: 'owner' }
          },
          issue: {
            number: 123,
            user: { login: 'issueauthor' }
          },
          comment: {
            id: 456,
            body: '@TestBot analyze this code',
            user: { login: 'testuser' }
          }
        }
      };

      await handleWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to process command',
          message: 'Claude API rate limit exceeded'
        })
      );
    });
  });

  describe('Pull request webhook handling', () => {
    it('should handle pull request comments correctly', async () => {
      processCommand.mockResolvedValueOnce('PR analysis completed');

      mockReq = {
        headers: {
          'x-github-event': 'pull_request',
          'x-github-delivery': 'test-delivery'
        },
        body: {
          action: 'created',
          repository: {
            full_name: 'owner/repo',
            name: 'repo',
            owner: { login: 'owner' }
          },
          sender: { login: 'testuser' },
          pull_request: {
            number: 42,
            head: { ref: 'feature/new-feature' },
            body: '@TestBot review this PR please'
          }
        }
      };

      await handleWebhook(mockReq, mockRes);

      expect(processCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          isPullRequest: true,
          branchName: 'feature/new-feature'
        })
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should reject PR webhooks with missing pull request data', async () => {
      mockReq = {
        headers: {
          'x-github-event': 'pull_request',
          'x-github-delivery': 'test-delivery'
        },
        body: {
          action: 'created',
          repository: {
            full_name: 'owner/repo',
            name: 'repo',
            owner: { login: 'owner' }
          },
          sender: { login: 'testuser' }
          // Missing pull_request data
        }
      };

      await handleWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Pull request data is missing from payload'
      });
    });
  });
});