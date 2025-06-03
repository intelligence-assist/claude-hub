import { IssueOpenedHandler } from '../../../../../src/providers/github/handlers/IssueHandler';

// Mock dependencies
jest.mock('../../../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  })
}));

jest.mock('../../../../../src/utils/secureCredentials', () => ({
  SecureCredentials: jest.fn().mockImplementation(() => ({
    loadCredentials: jest.fn(),
    getCredential: jest.fn().mockReturnValue('mock-value')
  })),
  secureCredentials: {
    loadCredentials: jest.fn(),
    getCredential: jest.fn().mockReturnValue('mock-value')
  }
}));

jest.mock('../../../../../src/services/claudeService');
jest.mock('../../../../../src/services/githubService');

const claudeService = require('../../../../../src/services/claudeService');

describe('IssueOpenedHandler', () => {
  let handler: IssueOpenedHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new IssueOpenedHandler();
  });

  describe('handle', () => {
    const mockPayload = {
      event: 'issues.opened',
      data: {
        action: 'opened',
        issue: {
          id: 123,
          number: 1,
          title: 'Test Issue',
          body: 'This is a test issue about authentication and API integration',
          labels: [],
          state: 'open',
          user: {
            login: 'testuser',
            id: 1
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        repository: {
          id: 456,
          name: 'test-repo',
          full_name: 'owner/test-repo',
          owner: {
            login: 'owner',
            id: 2
          },
          private: false
        },
        sender: {
          login: 'testuser',
          id: 1
        }
      }
    };

    const mockContext = {
      timestamp: new Date(),
      requestId: 'test-request-id'
    };

    it('should analyze and label new issues', async () => {
      claudeService.processCommand = jest.fn().mockResolvedValue('Labels applied successfully');

      const result = await handler.handle(mockPayload as any, mockContext);

      expect(claudeService.processCommand).toHaveBeenCalledWith({
        repoFullName: 'owner/test-repo',
        issueNumber: 1,
        command: expect.stringContaining('Analyze this GitHub issue'),
        isPullRequest: false,
        branchName: null,
        operationType: 'auto-tagging'
      });

      expect(result).toEqual({
        success: true,
        message: 'Issue auto-tagged successfully',
        data: {
          repo: 'owner/test-repo',
          issue: 1
        }
      });
    });

    it('should handle errors gracefully', async () => {
      claudeService.processCommand = jest.fn().mockRejectedValue(new Error('Analysis failed'));

      const result = await handler.handle(mockPayload as any, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Analysis failed');
    });
  });
});
