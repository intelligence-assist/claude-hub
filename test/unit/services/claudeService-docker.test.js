// Tests for Docker container management in Claude service
process.env.BOT_USERNAME = '@TestBot';
process.env.NODE_ENV = 'production'; // Test production paths

// Mock dependencies
jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
  execFile: jest.fn()
}));

jest.mock('util', () => ({
  promisify: jest.fn(fn => {
    if (fn.name === 'execFile') {
      return jest.fn();
    }
    return fn;
  })
}));

jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn()
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
    if (key === 'GITHUB_TOKEN') return 'github_pat_test_fine_grained_token';
    if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-test-key';
    return null;
  })
}));

const { execFileSync } = require('child_process');
const { promisify } = require('util');

describe('Claude Service - Docker Container Management', () => {
  let processCommand;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Re-require after mocks are set up
    processCommand = require('../../../src/services/claudeService').processCommand;
  });

  describe('Docker image management', () => {
    it('should use existing Docker image when available', async () => {
      // Mock Docker inspect success (image exists)
      execFileSync.mockReturnValueOnce('image exists');
      
      const execFileAsync = promisify(require('child_process').execFile);
      execFileAsync.mockResolvedValueOnce({
        stdout: 'Claude response from existing image',
        stderr: ''
      });

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'analyze this code',
        isPullRequest: false,
        branchName: null
      });

      // Should check for existing image but not build
      expect(execFileSync).toHaveBeenCalledWith(
        'docker',
        ['inspect', 'claudecode:latest'],
        { stdio: 'ignore' }
      );
      
      // Should not call build
      expect(execFileSync).not.toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['build'])
      );

      expect(result).toContain('Claude response from existing image');
    });

    it('should build Docker image when missing', async () => {
      // Mock Docker inspect failure (image doesn't exist)
      execFileSync.mockImplementationOnce(() => {
        const error = new Error('No such image');
        error.code = 1;
        throw error;
      });
      
      // Mock successful build
      execFileSync.mockReturnValueOnce('Successfully built image');
      
      const execFileAsync = promisify(require('child_process').execFile);
      execFileAsync.mockResolvedValueOnce({
        stdout: 'Claude response from new image',
        stderr: ''
      });

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'analyze this code',
        isPullRequest: false,
        branchName: null
      });

      // Should attempt to build the image
      expect(execFileSync).toHaveBeenCalledWith(
        'docker',
        ['build', '-f', 'Dockerfile.claudecode', '-t', 'claudecode:latest', '.'],
        expect.objectContaining({
          cwd: expect.stringContaining('claude-hub'),
          stdio: 'pipe'
        })
      );

      expect(result).toContain('Claude response from new image');
    });
  });

  describe('Container execution with different entrypoints', () => {
    beforeEach(() => {
      // Mock successful Docker image check
      execFileSync.mockReturnValueOnce('image exists');
    });

    it('should use auto-tagging entrypoint for issue labeling', async () => {
      const execFileAsync = promisify(require('child_process').execFile);
      execFileAsync.mockResolvedValueOnce({
        stdout: 'Applied labels: bug, high-priority',
        stderr: ''
      });

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'Auto-tag this issue based on content',
        isPullRequest: false,
        branchName: null,
        operationType: 'auto-tagging'
      });

      // Should use the tagging-specific entrypoint
      const dockerCall = execFileAsync.mock.calls[0];
      const dockerArgs = dockerCall[1];
      
      expect(dockerArgs).toContain('/scripts/runtime/claudecode-tagging-entrypoint.sh');
      expect(result).toContain('Applied labels');
    });

    it('should use standard entrypoint for PR reviews', async () => {
      const execFileAsync = promisify(require('child_process').execFile);
      execFileAsync.mockResolvedValueOnce({
        stdout: 'PR review completed with detailed feedback',
        stderr: ''
      });

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 42,
        command: 'Review this PR thoroughly',
        isPullRequest: true,
        branchName: 'feature/new-functionality'
      });

      // Should use the standard entrypoint
      const dockerCall = execFileAsync.mock.calls[0];
      const dockerArgs = dockerCall[1];
      
      expect(dockerArgs).toContain('/usr/local/bin/entrypoint.sh');
      expect(result).toContain('PR review completed');
    });
  });

  describe('Container failure recovery', () => {
    beforeEach(() => {
      // Mock successful Docker image check
      execFileSync.mockReturnValueOnce('image exists');
    });

    it('should retrieve logs when container execution fails', async () => {
      const execFileAsync = promisify(require('child_process').execFile);
      
      // Mock container execution failure
      const executionError = new Error('Container execution failed');
      executionError.code = 125;
      execFileAsync.mockRejectedValueOnce(executionError);
      
      // Mock successful log retrieval
      execFileSync.mockReturnValueOnce('Error logs: Authentication failed, please check credentials');

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'analyze repository',
        isPullRequest: false,
        branchName: null
      });

      // Should attempt to get logs as fallback
      expect(execFileSync).toHaveBeenCalledWith(
        'docker',
        ['logs', expect.stringMatching(/claude-owner-repo-\d+/)],
        expect.objectContaining({
          encoding: 'utf8',
          maxBuffer: 1024 * 1024
        })
      );

      expect(result).toContain('Error logs: Authentication failed');
    });

    it('should provide meaningful error when both execution and logs fail', async () => {
      const execFileAsync = promisify(require('child_process').execFile);
      
      // Mock container execution failure
      execFileAsync.mockRejectedValueOnce(new Error('Container execution failed'));
      
      // Mock log retrieval failure
      execFileSync.mockImplementationOnce(() => {
        throw new Error('Could not retrieve container logs');
      });

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'analyze repository',
        isPullRequest: false,
        branchName: null
      });

      expect(result).toMatch(/error occurred while processing.*request/i);
      expect(result).toMatch(/please check.*configuration/i);
    });
  });

  describe('GitHub token validation', () => {
    it('should work with fine-grained GitHub tokens', async () => {
      execFileSync.mockReturnValueOnce('image exists');
      
      const execFileAsync = promisify(require('child_process').execFile);
      execFileAsync.mockResolvedValueOnce({
        stdout: 'Successfully used fine-grained token',
        stderr: ''
      });

      const result = await processCommand({
        repoFullName: 'owner/repo',
        issueNumber: 123,
        command: 'check repository access',
        isPullRequest: false,
        branchName: null
      });

      expect(result).toContain('Successfully used fine-grained token');
    });
  });
});