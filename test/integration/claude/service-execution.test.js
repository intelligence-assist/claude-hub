/**
 * Integration test for Claude Service and container execution
 * 
 * This test verifies the integration between claudeService, Docker container execution,
 * and environment configuration.
 */

const { jest: jestGlobal } = require('@jest/globals');
const path = require('path');
const childProcess = require('child_process');

const claudeService = require('../../../src/services/claudeService');
const secureCredentials = require('../../../src/utils/secureCredentials');
const logger = require('../../../src/utils/logger');

// Mock child_process execFile
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFile: jest.fn(),
  execFileSync: jest.fn()
}));

describe('Claude Service Container Execution Integration', () => {
  let originalEnv;
  
  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Silence logger during tests
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
  });
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock Docker inspect to find the image
    childProcess.execFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'docker' && args[0] === 'inspect') {
        return JSON.stringify([{ Id: 'mock-container-id' }]);
      }
      return '';
    });
    
    // Mock Docker execFile to return a successful result
    childProcess.execFile.mockImplementation((cmd, args, options, callback) => {
      callback(null, {
        stdout: 'Claude container execution result',
        stderr: ''
      });
    });
    
    // Set production environment
    process.env = {
      NODE_ENV: 'production',
      BOT_USERNAME: '@TestBot',
      BOT_EMAIL: 'testbot@example.com',
      ENABLE_CONTAINER_FIREWALL: 'false',
      CLAUDE_CONTAINER_IMAGE: 'claude-code-runner:latest',
      ALLOWED_TOOLS: 'Read,GitHub,Bash,Edit,Write'
    };
    
    // Mock secureCredentials
    jest.spyOn(secureCredentials, 'get').mockImplementation(key => {
      if (key === 'GITHUB_TOKEN') return 'github-test-token';
      if (key === 'ANTHROPIC_API_KEY') return 'claude-test-key';
      return null;
    });
  });
  
  afterEach(() => {
    // Restore environment variables
    process.env = { ...originalEnv };
  });
  
  test('should build Docker command correctly for standard execution', async () => {
    // Execute Claude command
    const result = await claudeService.processCommand({
      repoFullName: 'test/repo',
      issueNumber: 123,
      command: 'Test command',
      isPullRequest: false,
      branchName: null
    });
    
    // Verify result
    expect(result).toBe('Claude container execution result');
    
    // Verify Docker execution
    expect(childProcess.execFile).toHaveBeenCalledTimes(1);
    
    // Extract args from call
    const callArgs = childProcess.execFile.mock.calls[0];
    const [cmd, args] = callArgs;
    
    // Verify basic Docker command
    expect(cmd).toBe('docker');
    expect(args[0]).toBe('run');
    expect(args).toContain('--rm');  // Container is removed after execution
    
    // Verify environment variables
    expect(args).toContain('-e');
    expect(args).toContain('GITHUB_TOKEN=github-test-token');
    expect(args).toContain('ANTHROPIC_API_KEY=claude-test-key');
    expect(args).toContain('REPO_FULL_NAME=test/repo');
    expect(args).toContain('ISSUE_NUMBER=123');
    expect(args).toContain('IS_PULL_REQUEST=false');
    
    // Verify command is passed correctly
    expect(args).toContain('Test command');
    
    // Verify entrypoint
    const entrypointIndex = args.indexOf('--entrypoint');
    expect(entrypointIndex).not.toBe(-1);
    expect(args[entrypointIndex + 1]).toContain('claudecode-entrypoint.sh');
    
    // Verify allowed tools
    expect(args).toContain('--allowedTools');
    expect(args).toContain('Read,GitHub,Bash,Edit,Write');
  });
  
  test('should build Docker command correctly for PR review', async () => {
    // Execute Claude command for PR
    const result = await claudeService.processCommand({
      repoFullName: 'test/repo',
      issueNumber: 456,
      command: 'Review PR',
      isPullRequest: true,
      branchName: 'feature-branch'
    });
    
    // Verify result
    expect(result).toBe('Claude container execution result');
    
    // Verify Docker execution
    expect(childProcess.execFile).toHaveBeenCalledTimes(1);
    
    // Extract args from call
    const callArgs = childProcess.execFile.mock.calls[0];
    const [cmd, args] = callArgs;
    
    // Verify PR-specific variables
    expect(args).toContain('-e');
    expect(args).toContain('IS_PULL_REQUEST=true');
    expect(args).toContain('BRANCH_NAME=feature-branch');
  });
  
  test('should build Docker command correctly for auto-tagging', async () => {
    // Execute Claude command for auto-tagging
    const result = await claudeService.processCommand({
      repoFullName: 'test/repo',
      issueNumber: 789,
      command: 'Auto-tag this issue',
      isPullRequest: false,
      branchName: null,
      operationType: 'auto-tagging'
    });
    
    // Verify result
    expect(result).toBe('Claude container execution result');
    
    // Verify Docker execution
    expect(childProcess.execFile).toHaveBeenCalledTimes(1);
    
    // Extract args from call
    const callArgs = childProcess.execFile.mock.calls[0];
    const [cmd, args] = callArgs;
    
    // Verify auto-tagging specific settings
    expect(args).toContain('-e');
    expect(args).toContain('OPERATION_TYPE=auto-tagging');
    
    // Verify entrypoint is specific to tagging
    const entrypointIndex = args.indexOf('--entrypoint');
    expect(entrypointIndex).not.toBe(-1);
    expect(args[entrypointIndex + 1]).toContain('claudecode-tagging-entrypoint.sh');
    
    // Auto-tagging only allows Read and GitHub tools
    expect(args).toContain('--allowedTools');
    expect(args).toContain('Read,GitHub');
  });
  
  test('should handle Docker container errors', async () => {
    // Mock Docker execution to fail
    childProcess.execFile.mockImplementation((cmd, args, options, callback) => {
      callback(new Error('Docker execution failed'), {
        stdout: '',
        stderr: 'Container error: command failed'
      });
    });
    
    // Expect promise rejection
    await expect(claudeService.processCommand({
      repoFullName: 'test/repo',
      issueNumber: 123,
      command: 'Test command',
      isPullRequest: false,
      branchName: null
    })).rejects.toThrow('Docker execution failed');
  });
  
  test('should handle missing Docker image and try to build it', async () => {
    // Mock Docker inspect to not find the image first time, then find it
    let inspectCallCount = 0;
    childProcess.execFileSync.mockImplementation((cmd, args) => {
      if (cmd === 'docker' && args[0] === 'inspect') {
        inspectCallCount++;
        if (inspectCallCount === 1) {
          // First call - image not found
          throw new Error('No such image');
        } else {
          // Second call - image found after build
          return JSON.stringify([{ Id: 'mock-container-id' }]);
        }
      }
      // Return success for other commands (like build)
      return 'Success';
    });
    
    // Execute Claude command
    const result = await claudeService.processCommand({
      repoFullName: 'test/repo',
      issueNumber: 123,
      command: 'Test command',
      isPullRequest: false,
      branchName: null
    });
    
    // Verify result
    expect(result).toBe('Claude container execution result');
    
    // Verify Docker build was attempted
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['build']),
      expect.anything()
    );
  });
  
  test('should use test mode in non-production environments', async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Mock test mode response
    jest.spyOn(claudeService, '_getTestModeResponse').mockReturnValue('Test mode response');
    
    // Execute Claude command
    const result = await claudeService.processCommand({
      repoFullName: 'test/repo',
      issueNumber: 123,
      command: 'Test command',
      isPullRequest: false,
      branchName: null
    });
    
    // Verify test mode response
    expect(result).toBe('Test mode response');
    
    // Verify Docker was not called
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });
  
  test('should sanitize command input before passing to container', async () => {
    // Test with command containing shell-unsafe characters
    const unsafeCommand = 'Test command with $(dangerous) `characters` && injection;';
    
    // Execute Claude command
    await claudeService.processCommand({
      repoFullName: 'test/repo',
      issueNumber: 123,
      command: unsafeCommand,
      isPullRequest: false,
      branchName: null
    });
    
    // Extract args from call
    const callArgs = childProcess.execFile.mock.calls[0];
    const [cmd, args] = callArgs;
    
    // Verify command was properly sanitized
    const commandIndex = args.indexOf(unsafeCommand);
    expect(commandIndex).toBe(-1); // Raw command should not be there
    
    // The command should be sanitized and passed as the last argument
    const lastArg = args[args.length - 1];
    expect(lastArg).not.toContain('$(dangerous)');
    expect(lastArg).not.toContain('`characters`');
  });
});