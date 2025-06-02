import { Command } from 'commander';
import { registerStartCommand } from '../../src/commands/start';
import { SessionManager } from '../../src/utils/sessionManager';
import { DockerUtils } from '../../src/utils/dockerUtils';

// Mock the utilities
jest.mock('../../src/utils/sessionManager');
jest.mock('../../src/utils/dockerUtils');
jest.mock('ora', () => {
  return jest.fn().mockImplementation(() => {
    return {
      start: jest.fn().mockReturnThis(),
      stop: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      warn: jest.fn().mockReturnThis(),
      info: jest.fn().mockReturnThis(),
      text: '',
    };
  });
});

// Mock console.log to prevent output during tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

describe('start command', () => {
  // Test command and mocks
  let program: Command;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockDockerUtils: jest.Mocked<DockerUtils>;
  
  // Command execution helpers
  let parseArgs: (args: string[]) => Promise<void>;
  
  beforeEach(() => {
    // Reset console mocks
    console.log = jest.fn();
    console.warn = jest.fn();
    
    // Reset program for each test
    program = new Command();
    
    // Register the command
    registerStartCommand(program);
    
    // Create parse helper
    parseArgs = async (args: string[]): Promise<void> => {
      try {
        await program.parseAsync(['node', 'test', ...args]);
      } catch (e) {
        // Swallow commander errors
      }
    };
    
    // Get the mock instances
    mockSessionManager = SessionManager.prototype as jest.Mocked<SessionManager>;
    mockDockerUtils = DockerUtils.prototype as jest.Mocked<DockerUtils>;
    
    // Setup default mock behaviors
    mockSessionManager.generateSessionId.mockReturnValue('test-session-id');
    mockSessionManager.createSession.mockImplementation((session) => {
      return {
        ...session,
        id: 'test-session-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
    
    mockDockerUtils.isDockerAvailable.mockResolvedValue(true);
    mockDockerUtils.ensureImageExists.mockResolvedValue(true);
    mockDockerUtils.startContainer.mockResolvedValue('test-container-id');
  });
  
  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    
    // Clear all mocks
    jest.clearAllMocks();
  });
  
  it('should start a session for a repository', async () => {
    // Execute the command
    await parseArgs(['start', 'owner/repo', 'analyze this code']);
    
    // Verify the Docker container was started
    expect(mockDockerUtils.isDockerAvailable).toHaveBeenCalled();
    expect(mockDockerUtils.ensureImageExists).toHaveBeenCalled();
    expect(mockDockerUtils.startContainer).toHaveBeenCalledWith(
      'claude-hub-test-session-id',
      expect.objectContaining({
        REPO_FULL_NAME: 'owner/repo',
        IS_PULL_REQUEST: 'false',
        IS_ISSUE: 'false',
        COMMAND: expect.stringContaining('analyze this code')
      }),
      undefined
    );
    
    // Verify the session was created
    expect(mockSessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        repoFullName: 'owner/repo',
        containerId: 'test-container-id',
        command: 'analyze this code',
        status: 'running'
      })
    );
  });
  
  it('should add default owner when repo format is simple', async () => {
    // Save original env
    const originalEnv = process.env.DEFAULT_GITHUB_OWNER;
    // Set env for test
    process.env.DEFAULT_GITHUB_OWNER = 'default-owner';
    
    // Execute the command
    await parseArgs(['start', 'repo', 'analyze this code']);
    
    // Verify the correct repository name was used
    expect(mockDockerUtils.startContainer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        REPO_FULL_NAME: 'default-owner/repo'
      }),
      undefined
    );
    
    // Restore original env
    process.env.DEFAULT_GITHUB_OWNER = originalEnv;
  });
  
  it('should handle pull request context', async () => {
    // Execute the command with PR option
    await parseArgs(['start', 'owner/repo', 'review this PR', '--pr', '42', '--branch', 'feature-branch']);
    
    // Verify PR context was set
    expect(mockDockerUtils.startContainer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        REPO_FULL_NAME: 'owner/repo',
        IS_PULL_REQUEST: 'true',
        IS_ISSUE: 'false',
        ISSUE_NUMBER: '42',
        BRANCH_NAME: 'feature-branch',
        COMMAND: expect.stringContaining('pull request')
      }),
      undefined
    );
    
    // Verify the session was created with PR context
    expect(mockSessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        isPullRequest: true,
        isIssue: false,
        prNumber: 42,
        branchName: 'feature-branch'
      })
    );
  });
  
  it('should handle issue context', async () => {
    // Execute the command with issue option
    await parseArgs(['start', 'owner/repo', 'fix this issue', '--issue', '123']);
    
    // Verify issue context was set
    expect(mockDockerUtils.startContainer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        REPO_FULL_NAME: 'owner/repo',
        IS_PULL_REQUEST: 'false',
        IS_ISSUE: 'true',
        ISSUE_NUMBER: '123',
        COMMAND: expect.stringContaining('issue')
      }),
      undefined
    );
    
    // Verify the session was created with issue context
    expect(mockSessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        isPullRequest: false,
        isIssue: true,
        issueNumber: 123
      })
    );
  });
  
  it('should apply resource limits', async () => {
    // Execute the command with resource limits
    await parseArgs([
      'start', 'owner/repo', 'analyze this code',
      '--memory', '4g',
      '--cpu', '2048',
      '--pids', '512'
    ]);
    
    // Verify resource limits were passed
    expect(mockDockerUtils.startContainer).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        memory: '4g',
        cpuShares: '2048',
        pidsLimit: '512'
      }
    );
    
    // Verify the session was created with resource limits
    expect(mockSessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceLimits: {
          memory: '4g',
          cpuShares: '2048',
          pidsLimit: '512'
        }
      })
    );
  });
  
  it('should fail when Docker is not available', async () => {
    // Mock Docker not available
    mockDockerUtils.isDockerAvailable.mockResolvedValue(false);
    
    // Execute the command
    await parseArgs(['start', 'owner/repo', 'analyze this code']);
    
    // Verify Docker availability was checked
    expect(mockDockerUtils.isDockerAvailable).toHaveBeenCalled();
    
    // Verify the container was not started
    expect(mockDockerUtils.startContainer).not.toHaveBeenCalled();
    
    // Verify no session was created
    expect(mockSessionManager.createSession).not.toHaveBeenCalled();
  });
  
  it('should fail when Docker image cannot be ensured', async () => {
    // Mock Docker image not available
    mockDockerUtils.ensureImageExists.mockResolvedValue(false);
    
    // Execute the command
    await parseArgs(['start', 'owner/repo', 'analyze this code']);
    
    // Verify Docker image check was attempted
    expect(mockDockerUtils.ensureImageExists).toHaveBeenCalled();
    
    // Verify the container was not started
    expect(mockDockerUtils.startContainer).not.toHaveBeenCalled();
    
    // Verify no session was created
    expect(mockSessionManager.createSession).not.toHaveBeenCalled();
  });
  
  it('should fail when both PR and issue options are specified', async () => {
    // Execute the command with conflicting options
    await parseArgs(['start', 'owner/repo', 'conflicting context', '--pr', '42', '--issue', '123']);
    
    // Verify Docker checks were not performed
    expect(mockDockerUtils.isDockerAvailable).not.toHaveBeenCalled();
    
    // Verify the container was not started
    expect(mockDockerUtils.startContainer).not.toHaveBeenCalled();
    
    // Verify no session was created
    expect(mockSessionManager.createSession).not.toHaveBeenCalled();
  });
  
  it('should warn when branch is specified without PR context', async () => {
    // Execute the command with branch but no PR
    await parseArgs(['start', 'owner/repo', 'analyze this code', '--branch', 'feature-branch']);
    
    // Verify the session was created anyway
    expect(mockSessionManager.createSession).toHaveBeenCalled();
    
    // Verify the branch was ignored (not set in PR context)
    expect(mockSessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        isPullRequest: false,
        branchName: 'feature-branch'
      })
    );
  });
  
  it('should handle container start failure', async () => {
    // Mock container start failure
    mockDockerUtils.startContainer.mockResolvedValue(null);
    
    // Execute the command
    await parseArgs(['start', 'owner/repo', 'analyze this code']);
    
    // Verify Docker container start was attempted
    expect(mockDockerUtils.startContainer).toHaveBeenCalled();
    
    // Verify no session was created
    expect(mockSessionManager.createSession).not.toHaveBeenCalled();
  });
});