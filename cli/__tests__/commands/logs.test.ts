import { Command } from 'commander';
import { registerLogsCommand } from '../../src/commands/logs';
import { SessionManager } from '../../src/utils/sessionManager';
import { DockerUtils } from '../../src/utils/dockerUtils';
import { SessionConfig } from '../../src/types/session';
import ora from 'ora';

// Mock dependencies
jest.mock('../../src/utils/sessionManager');
jest.mock('../../src/utils/dockerUtils');
jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: ''
  };
  return jest.fn(() => mockSpinner);
});

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();

describe('Logs Command', () => {
  let program: Command;
  let mockGetSession: jest.Mock;
  let mockUpdateSessionStatus: jest.Mock;
  let mockIsContainerRunning: jest.Mock;
  let mockGetContainerLogs: jest.Mock;
  let mockSpinner: { start: jest.Mock; stop: jest.Mock; fail: jest.Mock; };
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup program
    program = new Command();
    
    // Setup SessionManager mock
    mockGetSession = jest.fn();
    mockUpdateSessionStatus = jest.fn();
    (SessionManager as jest.Mock).mockImplementation(() => ({
      getSession: mockGetSession,
      updateSessionStatus: mockUpdateSessionStatus
    }));
    
    // Setup DockerUtils mock
    mockIsContainerRunning = jest.fn();
    mockGetContainerLogs = jest.fn();
    (DockerUtils as jest.Mock).mockImplementation(() => ({
      isContainerRunning: mockIsContainerRunning,
      getContainerLogs: mockGetContainerLogs
    }));
    
    // Setup ora spinner mock
    mockSpinner = ora('') as unknown as { start: jest.Mock; stop: jest.Mock; fail: jest.Mock; };
    
    // Register the command
    registerLogsCommand(program);
  });
  
  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockConsoleWarn.mockClear();
  });
  
  const mockSession: SessionConfig = {
    id: 'session1',
    repoFullName: 'user/repo1',
    containerId: 'container1',
    command: 'help me with this code',
    status: 'running',
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-01T10:05:00Z'
  };
  
  it('should show logs for a running session', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(mockSession);
    mockIsContainerRunning.mockResolvedValue(true);
    mockGetContainerLogs.mockResolvedValue('Sample log output');
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'logs', 'session1']);
    
    // Check if session was retrieved
    expect(mockGetSession).toHaveBeenCalledWith('session1');
    
    // Check if container running status was checked
    expect(mockIsContainerRunning).toHaveBeenCalledWith('container1');
    
    // Session status should not be updated for a running container
    expect(mockUpdateSessionStatus).not.toHaveBeenCalled();
    
    // Check if logs were fetched
    expect(mockGetContainerLogs).toHaveBeenCalledWith('container1', false, expect.any(Number));
    
    // Check that session details were printed
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Session details:'));
    
    // Check that logs were printed
    expect(mockConsoleLog).toHaveBeenCalledWith('Sample log output');
  });
  
  it('should fail when session does not exist', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(null);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'logs', 'nonexistent']);
    
    // Check if session was retrieved
    expect(mockGetSession).toHaveBeenCalledWith('nonexistent');
    
    // Docker utils should not be called
    expect(mockIsContainerRunning).not.toHaveBeenCalled();
    expect(mockGetContainerLogs).not.toHaveBeenCalled();
    
    // Check for error message
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
  
  it('should update session status when container is not running but session status is running', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(mockSession);
    mockIsContainerRunning.mockResolvedValue(false);
    mockGetContainerLogs.mockResolvedValue('Sample log output');
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'logs', 'session1']);
    
    // Check if session was retrieved
    expect(mockGetSession).toHaveBeenCalledWith('session1');
    
    // Check if container running status was checked
    expect(mockIsContainerRunning).toHaveBeenCalledWith('container1');
    
    // Session status should be updated
    expect(mockUpdateSessionStatus).toHaveBeenCalledWith('session1', 'stopped');
    
    // Check if logs were still fetched
    expect(mockGetContainerLogs).toHaveBeenCalledWith('container1', false, expect.any(Number));
  });
  
  it('should follow logs when --follow option is provided', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(mockSession);
    mockIsContainerRunning.mockResolvedValue(true);
    mockGetContainerLogs.mockResolvedValue(undefined); // Follow mode doesn't return logs
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'logs', 'session1', '--follow']);
    
    // Check if logs were fetched with follow=true
    expect(mockGetContainerLogs).toHaveBeenCalledWith('container1', true, expect.any(Number));
    
    // Check that streaming message was printed
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Streaming logs'));
  });
  
  it('should warn when using --follow on a non-running session', async () => {
    // Setup mocks with non-running session
    const stoppedSession = { ...mockSession, status: 'stopped' };
    mockGetSession.mockReturnValue(stoppedSession);
    mockIsContainerRunning.mockResolvedValue(false);
    mockGetContainerLogs.mockResolvedValue(undefined);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'logs', 'session1', '--follow']);
    
    // Check that warning was printed
    expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Warning'));
    
    // Should still try to follow logs
    expect(mockGetContainerLogs).toHaveBeenCalledWith('container1', true, expect.any(Number));
  });
  
  it('should use custom tail value when --tail option is provided', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(mockSession);
    mockIsContainerRunning.mockResolvedValue(true);
    mockGetContainerLogs.mockResolvedValue('Sample log output');
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'logs', 'session1', '--tail', '50']);
    
    // Check if logs were fetched with custom tail value
    expect(mockGetContainerLogs).toHaveBeenCalledWith('container1', false, 50);
  });
  
  it('should reject invalid tail values', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(mockSession);
    
    // Execute the command with invalid tail value
    await program.parseAsync(['node', 'test', 'logs', 'session1', '--tail', '-1']);
    
    // Check for error message
    expect(mockConsoleError).toHaveBeenCalledWith('Tail must be a non-negative number');
    
    // Should not fetch logs
    expect(mockGetContainerLogs).not.toHaveBeenCalled();
  });
  
  it('should handle errors when fetching logs', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(mockSession);
    mockIsContainerRunning.mockResolvedValue(true);
    mockGetContainerLogs.mockRejectedValue(new Error('Docker error'));
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'logs', 'session1']);
    
    // Check if error was handled
    expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('Failed to retrieve logs'));
  });
  
  it('should handle general errors', async () => {
    // Setup mocks to throw error
    mockGetSession.mockImplementation(() => {
      throw new Error('Unexpected error');
    });
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'logs', 'session1']);
    
    // Check for error message
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error showing logs'));
  });
});