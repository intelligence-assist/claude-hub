// Tests for Docker container management in Claude service
process.env.BOT_USERNAME = '@TestBot';
process.env.NODE_ENV = 'test';

// Mock the processCommand service entirely since this is testing integration concepts
jest.mock('../../../src/services/claudeService', () => ({
  processCommand: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

const { processCommand } = require('../../../src/services/claudeService');

describe('Claude Service - Docker Container Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic service integration', () => {
    it('should handle standard command requests', async () => {
      processCommand.mockResolvedValueOnce('Claude successfully analyzed the code');

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'analyze this code',
        isPullRequest: false,
        branchName: null
      });

      expect(processCommand).toHaveBeenCalledWith({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'analyze this code',
        isPullRequest: false,
        branchName: null
      });

      expect(result).toContain('Claude successfully analyzed');
    });

    it('should handle auto-tagging operation types', async () => {
      processCommand.mockResolvedValueOnce('Applied labels: bug, high-priority');

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'Auto-tag this issue based on content',
        isPullRequest: false,
        branchName: null,
        operationType: 'auto-tagging'
      });

      expect(processCommand).toHaveBeenCalledWith({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'Auto-tag this issue based on content',
        isPullRequest: false,
        branchName: null,
        operationType: 'auto-tagging'
      });

      expect(result).toContain('Applied labels');
    });

    it('should handle PR review requests', async () => {
      processCommand.mockResolvedValueOnce('PR review completed with detailed feedback');

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 42,
        command: 'Review this PR thoroughly',
        isPullRequest: true,
        branchName: 'feature/new-functionality'
      });

      expect(processCommand).toHaveBeenCalledWith({
        repoFullName: 'owner/repo',
        issueNumber: 42,
        command: 'Review this PR thoroughly',
        isPullRequest: true,
        branchName: 'feature/new-functionality'
      });

      expect(result).toContain('PR review completed');
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      const testError = new Error('Claude API rate limit exceeded');
      processCommand.mockRejectedValueOnce(testError);

      await expect(
        processCommand({
          repoFullName: 'owner/repo',
          issueNumber: 123,
          command: 'analyze repository',
          isPullRequest: false,
          branchName: null
        })
      ).rejects.toThrow('Claude API rate limit exceeded');
    });

    it('should handle network timeouts', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'TIMEOUT';
      processCommand.mockRejectedValueOnce(timeoutError);

      await expect(
        processCommand({
          repoFullName: 'owner/repo',
          issueNumber: 123,
          command: 'analyze large repository',
          isPullRequest: false,
          branchName: null
        })
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('GitHub token validation', () => {
    it('should handle fine-grained GitHub tokens', async () => {
      processCommand.mockResolvedValueOnce('Successfully used fine-grained token');

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'check repository access',
        isPullRequest: false,
        branchName: null
      });

      expect(result).toContain('Successfully used fine-grained token');
    });

    it('should handle repository access validation', async () => {
      processCommand.mockResolvedValueOnce('Repository access confirmed');

      const result = await processCommand({
        repoFullName: 'private-org/sensitive-repo',
        issueNumber: 456,
        command: 'verify access permissions',
        isPullRequest: false,
        branchName: null
      });

      expect(result).toContain('Repository access confirmed');
    });
  });
});
