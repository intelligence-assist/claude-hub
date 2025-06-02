import { Command } from 'commander';
import { registerContinueCommand } from '../../src/commands/continue';
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

describe('Continue Command', () => {
  let program: Command;
  let mockGetSession: jest.Mock;
  let mockUpdateSessionStatus: jest.Mock;
  let mockSaveSession: jest.Mock;
  let mockIsContainerRunning: jest.Mock;
  let mockExecuteCommand: jest.Mock;
  let mockSpinner: { start: jest.Mock; succeed: jest.Mock; fail: jest.Mock; };
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup program
    program = new Command();
    
    // Setup SessionManager mock
    mockGetSession = jest.fn();
    mockUpdateSessionStatus = jest.fn();
    mockSaveSession = jest.fn();
    (SessionManager as jest.Mock).mockImplementation(() => ({
      getSession: mockGetSession,
      updateSessionStatus: mockUpdateSessionStatus,
      saveSession: mockSaveSession
    }));
    
    // Setup DockerUtils mock
    mockIsContainerRunning = jest.fn();
    mockExecuteCommand = jest.fn();
    (DockerUtils as jest.Mock).mockImplementation(() => ({
      isContainerRunning: mockIsContainerRunning,
      executeCommand: mockExecuteCommand
    }));
    
    // Setup ora spinner mock
    mockSpinner = ora('') as unknown as { start: jest.Mock; succeed: jest.Mock; fail: jest.Mock; };
    
    // Register the command
    registerContinueCommand(program);
  });
  
  afterEach(() => {
    mockConsoleLog.mockClear();
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
  
  it('should continue a running session with a new command', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(mockSession);
    mockIsContainerRunning.mockResolvedValue(true);
    mockExecuteCommand.mockResolvedValue({ stdout: 'Command executed' });
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'continue', 'session1', 'analyze this function']);
    
    // Check if session was retrieved
    expect(mockGetSession).toHaveBeenCalledWith('session1');
    
    // Check if container running status was checked
    expect(mockIsContainerRunning).toHaveBeenCalledWith('container1');
    
    // Check if command was executed in container
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'container1',
      expect.stringContaining('analyze this function')
    );
    
    // Check if session was updated
    expect(mockSaveSession).toHaveBeenCalledWith(expect.objectContaining({
      id: 'session1',
      command: expect.stringContaining('Continuation: analyze this function')
    }));
    
    // Check for success message
    expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining('Command sent to session'));
  });
  
  it('should fail when session does not exist', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(null);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'continue', 'nonexistent', 'analyze this function']);
    
    // Check if session was retrieved
    expect(mockGetSession).toHaveBeenCalledWith('nonexistent');
    
    // Container status should not be checked
    expect(mockIsContainerRunning).not.toHaveBeenCalled();
    
    // Command should not be executed
    expect(mockExecuteCommand).not.toHaveBeenCalled();
    
    // Check for failure message
    expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
  
  it('should fail when container is not running', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(mockSession);
    mockIsContainerRunning.mockResolvedValue(false);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'continue', 'session1', 'analyze this function']);
    
    // Check if session was retrieved
    expect(mockGetSession).toHaveBeenCalledWith('session1');
    
    // Check if container running status was checked
    expect(mockIsContainerRunning).toHaveBeenCalledWith('container1');
    
    // Command should not be executed
    expect(mockExecuteCommand).not.toHaveBeenCalled();
    
    // Check if session status was updated
    expect(mockUpdateSessionStatus).toHaveBeenCalledWith('session1', 'stopped');
    
    // Check for failure message
    expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('not running'));
  });
  
  it('should handle errors during command execution', async () => {
    // Setup mocks
    mockGetSession.mockReturnValue(mockSession);
    mockIsContainerRunning.mockResolvedValue(true);
    mockExecuteCommand.mockRejectedValue(new Error('Command execution failed'));
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'continue', 'session1', 'analyze this function']);
    
    // Checks should still have been made
    expect(mockGetSession).toHaveBeenCalled();
    expect(mockIsContainerRunning).toHaveBeenCalled();
    expect(mockExecuteCommand).toHaveBeenCalled();
    
    // Session should not be updated
    expect(mockSaveSession).not.toHaveBeenCalled();
    
    // Check for failure message
    expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('Failed to continue session'));
  });
  
  it('should not update session status if session is not running', async () => {
    // Setup mocks with non-running session
    const stoppedSession = { ...mockSession, status: 'stopped' };
    mockGetSession.mockReturnValue(stoppedSession);
    mockIsContainerRunning.mockResolvedValue(false);
    
    // Execute the command
    await program.parseAsync(['node', 'test', 'continue', 'session1', 'analyze this function']);
    
    // Check if session status was NOT updated (already stopped)
    expect(mockUpdateSessionStatus).not.toHaveBeenCalled();
    
    // Check for failure message
    expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('not running'));
  });
});