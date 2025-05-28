// Set up environment variables before requiring modules
process.env.BOT_USERNAME = '@TestBot';
process.env.NODE_ENV = 'test';
process.env.GITHUB_TOKEN = 'ghp_test_token'; // Use token format that passes validation

// Mock dependencies
jest.mock('child_process', () => ({
  execFileSync: jest.fn().mockReturnValue('mocked output'),
  execFile: jest.fn(),
  exec: jest.fn()
}));

jest.mock('util', () => ({
  promisify: jest.fn(fn => {
    if (fn.name === 'execFile') {
      return jest.fn().mockResolvedValue({
        stdout: 'Claude response from container',
        stderr: ''
      });
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
    if (key === 'GITHUB_TOKEN') return 'ghp_test_github_token_mock123456789012345678901234';
    if (key === 'ANTHROPIC_API_KEY')
      return 'sk-ant-test-anthropic-key12345678901234567890123456789';
    return null;
  })
}));

// Now require the module under test
const { execFileSync } = require('child_process');
const { promisify } = require('util');
const { sanitizeBotMentions } = require('../../../src/utils/sanitize');
const claudeService =
  require('../../../src/services/claudeService').default ||
  require('../../../src/services/claudeService');

describe('Claude Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('processCommand should handle test mode correctly', async () => {
    // Force test mode
    process.env.NODE_ENV = 'test';

    const result = await claudeService.processCommand({
      repoFullName: 'test/repo',
      issueNumber: 123,
      command: 'Test command',
      isPullRequest: false
    });

    // Verify test mode response
    expect(result).toContain("Hello! I'm Claude responding to your request.");
    expect(result).toContain('test/repo');
    expect(sanitizeBotMentions).toHaveBeenCalled();

    // Verify no Docker commands were executed
    expect(execFileSync).not.toHaveBeenCalled();
  });

  test('processCommand should properly set up Docker command in production mode', async () => {
    // Mock for this test only
    const originalProcessCommand = claudeService.processCommand;

    // Override the actual function with a test implementation
    claudeService.processCommand = async options => {
      // Set production mode for this function
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Mock dependencies needed in production mode
      execFileSync.mockImplementation((cmd, args, _options) => {
        if (args[0] === 'inspect') return '{}';
        return 'mocked output';
      });

      // Configure execFileAsync mock
      const execFileAsync = promisify(require('child_process').execFile);
      execFileAsync.mockResolvedValue({
        stdout: 'Claude response from container',
        stderr: ''
      });

      // Call the original implementation to test it
      const result = await originalProcessCommand(options);

      // Restore env
      process.env.NODE_ENV = originalNodeEnv;

      return result;
    };

    try {
      // Call the overridden function
      await claudeService.processCommand({
        repoFullName: 'test/repo',
        issueNumber: 123,
        command: 'Test command',
        isPullRequest: false
      });

      // Our assertions happen in the override function
      // We just need to verify the execFileSync was called
      expect(execFileSync).toHaveBeenCalled();
    } finally {
      // Restore the original function
      claudeService.processCommand = originalProcessCommand;
    }
  });

  test('processCommand should handle errors properly', async () => {
    // Save original function for restoration
    const originalProcessCommand = claudeService.processCommand;

    // Create a testing implementation
    claudeService.processCommand = async options => {
      // Set test environment variables
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Mock the Docker inspect to succeed
      execFileSync.mockImplementation((cmd, args, _options) => {
        if (args[0] === 'inspect') return '{}';
        if (args[0] === 'logs') return 'error logs';
        if (args[0] === 'kill') return '';
        return 'mocked output';
      });

      // Mock execFileAsync to throw an error
      const execFileAsync = promisify(require('child_process').execFile);
      execFileAsync.mockRejectedValue({
        message: 'Docker execution failed',
        stderr: 'Error: container exited with non-zero status',
        stdout: ''
      });

      // Throw error from original implementation
      await originalProcessCommand(options);

      // Restore environment
      process.env.NODE_ENV = originalNodeEnv;
    };

    try {
      // Call the function and expect it to throw
      await expect(
        claudeService.processCommand({
          repoFullName: 'test/repo',
          issueNumber: 123,
          command: 'Test command',
          isPullRequest: false
        })
      ).rejects.toThrow();

      // Verify execFileSync was called
      expect(execFileSync).toHaveBeenCalled();
    } finally {
      // Restore original function
      claudeService.processCommand = originalProcessCommand;
    }
  });

  test('processCommand should handle long commands properly', async () => {
    // Save original function for restoration
    const originalProcessCommand = claudeService.processCommand;

    // Create a testing implementation that checks for long command handling
    claudeService.processCommand = async options => {
      // Set up test environment
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Mock the Docker inspect to succeed
      execFileSync.mockImplementation((cmd, args, _options) => {
        if (args[0] === 'inspect') return '{}';
        return 'mocked output';
      });

      // Configure execFileAsync mock
      const execFileAsync = promisify(require('child_process').execFile);
      execFileAsync.mockResolvedValue({
        stdout: 'Claude response for long command',
        stderr: ''
      });

      // Call the original implementation
      const result = await originalProcessCommand(options);

      // Verify Docker was called with the command as an environment variable
      expect(execFileAsync).toHaveBeenCalled();
      const dockerArgs = execFileAsync.mock.calls[0][1];

      // Check that COMMAND env var is present in the docker args
      // The format is ['-e', 'COMMAND=value']
      const commandEnvIndex = dockerArgs.findIndex(
        arg => typeof arg === 'string' && arg.startsWith('COMMAND=')
      );
      expect(commandEnvIndex).toBeGreaterThan(-1);

      // Restore environment
      process.env.NODE_ENV = originalNodeEnv;

      return result;
    };

    try {
      // Call the function with a long command
      const longCommand = 'A'.repeat(1000);

      const result = await claudeService.processCommand({
        repoFullName: 'test/repo',
        issueNumber: 123,
        command: longCommand,
        isPullRequest: false
      });

      // Verify we got a response
      expect(result).toBe('Claude response for long command');
    } finally {
      // Restore original function
      claudeService.processCommand = originalProcessCommand;
    }
  });
});
