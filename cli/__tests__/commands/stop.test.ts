import { Command } from 'commander';
import { registerStopCommand } from '../../src/commands/stop';
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
    info: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    text: ''
  };
  return jest.fn(() => mockSpinner);
});

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

describe('Stop Command', () => {
  let program: Command;
  let mockGetSession: jest.Mock;
  let mockUpdateSessionStatus: jest.Mock;
  let mockDeleteSession: jest.Mock;
  let mockListSessions: jest.Mock;
  let mockIsContainerRunning: jest.Mock;
  let mockStopContainer: jest.Mock;
  let mockSpinner: { 
    start: jest.Mock; 
    succeed: jest.Mock; 
    fail: jest.Mock; 
    info: jest.Mock;
    warn: jest.Mock;
  };
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup program
    program = new Command();
    
    // Setup SessionManager mock
    mockGetSession = jest.fn();
    mockUpdateSessionStatus = jest.fn();
    mockDeleteSession = jest.fn();
    mockListSessions = jest.fn();
    (SessionManager as jest.Mock).mockImplementation(() => ({
      getSession: mockGetSession,
      updateSessionStatus: mockUpdateSessionStatus,
      deleteSession: mockDeleteSession,
      listSessions: mockListSessions
    }));
    
    // Setup DockerUtils mock
    mockIsContainerRunning = jest.fn();
    mockStopContainer = jest.fn();
    (DockerUtils as jest.Mock).mockImplementation(() => ({
      isContainerRunning: mockIsContainerRunning,
      stopContainer: mockStopContainer
    }));
    
    // Setup ora spinner mock
    mockSpinner = ora('') as unknown as { 
      start: jest.Mock; 
      succeed: jest.Mock; 
      fail: jest.Mock; 
      info: jest.Mock;
      warn: jest.Mock;
    };
    
    // Register the command
    registerStopCommand(program);
  });
  
  afterEach(() => {
    mockConsoleLog.mockClear();
  });
  
  const mockRunningSession: SessionConfig = {
    id: 'session1',
    repoFullName: 'user/repo1',
    containerId: 'container1',
    command: 'help me with this code',
    status: 'running',
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-01T10:05:00Z'
  };
  
  const mockStoppedSession: SessionConfig = {
    ...mockRunningSession,
    status: 'stopped'
  };
  
  describe('stop single session', () => {
    it('should stop a running session', async () => {
      // Setup mocks
      mockGetSession.mockReturnValue(mockRunningSession);
      mockIsContainerRunning.mockResolvedValue(true);
      mockStopContainer.mockResolvedValue(true);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'session1']);
      
      // Check if session was retrieved
      expect(mockGetSession).toHaveBeenCalledWith('session1');
      
      // Check if container running status was checked
      expect(mockIsContainerRunning).toHaveBeenCalledWith('container1');
      
      // Check if container was stopped
      expect(mockStopContainer).toHaveBeenCalledWith('container1', undefined);
      
      // Check if session status was updated
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith('session1', 'stopped');
      
      // Check for success message
      expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining('stopped'));
    });
    
    it('should use force option when provided', async () => {
      // Setup mocks
      mockGetSession.mockReturnValue(mockRunningSession);
      mockIsContainerRunning.mockResolvedValue(true);
      mockStopContainer.mockResolvedValue(true);
      
      // Execute the command with force option
      await program.parseAsync(['node', 'test', 'stop', 'session1', '--force']);
      
      // Check if container was force stopped
      expect(mockStopContainer).toHaveBeenCalledWith('container1', true);
    });
    
    it('should remove session when --remove option is provided', async () => {
      // Setup mocks
      mockGetSession.mockReturnValue(mockRunningSession);
      mockIsContainerRunning.mockResolvedValue(true);
      mockStopContainer.mockResolvedValue(true);
      
      // Execute the command with remove option
      await program.parseAsync(['node', 'test', 'stop', 'session1', '--remove']);
      
      // Check if container was stopped
      expect(mockStopContainer).toHaveBeenCalledWith('container1', undefined);
      
      // Check if session was updated and then deleted
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith('session1', 'stopped');
      expect(mockDeleteSession).toHaveBeenCalledWith('session1');
      
      // Check for success message
      expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining('stopped and removed'));
    });
    
    it('should fail when session does not exist', async () => {
      // Setup mocks
      mockGetSession.mockReturnValue(null);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'nonexistent']);
      
      // Check if session was retrieved
      expect(mockGetSession).toHaveBeenCalledWith('nonexistent');
      
      // Should not try to check or stop container
      expect(mockIsContainerRunning).not.toHaveBeenCalled();
      expect(mockStopContainer).not.toHaveBeenCalled();
      
      // Check for failure message
      expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
    
    it('should handle already stopped sessions correctly', async () => {
      // Setup mocks with already stopped session
      mockGetSession.mockReturnValue(mockStoppedSession);
      mockIsContainerRunning.mockResolvedValue(false);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'session1']);
      
      // Check if session was retrieved
      expect(mockGetSession).toHaveBeenCalledWith('session1');
      
      // Check if container running status was checked
      expect(mockIsContainerRunning).toHaveBeenCalledWith('container1');
      
      // Should not try to stop container that's not running
      expect(mockStopContainer).not.toHaveBeenCalled();
      
      // Session status should not be updated since it's already stopped
      expect(mockUpdateSessionStatus).not.toHaveBeenCalled();
      
      // Check for info message
      expect(mockSpinner.info).toHaveBeenCalledWith(expect.stringContaining('already stopped'));
    });
    
    it('should update session status if marked as running but container is not running', async () => {
      // Setup mocks with session marked as running but container not running
      mockGetSession.mockReturnValue(mockRunningSession);
      mockIsContainerRunning.mockResolvedValue(false);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'session1']);
      
      // Check if session was retrieved
      expect(mockGetSession).toHaveBeenCalledWith('session1');
      
      // Check if container running status was checked
      expect(mockIsContainerRunning).toHaveBeenCalledWith('container1');
      
      // Should not try to stop container that's not running
      expect(mockStopContainer).not.toHaveBeenCalled();
      
      // Session status should be updated
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith('session1', 'stopped');
      
      // Check for info message
      expect(mockSpinner.info).toHaveBeenCalledWith(expect.stringContaining('already stopped, updated status'));
    });
    
    it('should handle failure to stop container', async () => {
      // Setup mocks
      mockGetSession.mockReturnValue(mockRunningSession);
      mockIsContainerRunning.mockResolvedValue(true);
      mockStopContainer.mockResolvedValue(false);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'session1']);
      
      // Check if container was attempted to be stopped
      expect(mockStopContainer).toHaveBeenCalledWith('container1', undefined);
      
      // Session status should not be updated
      expect(mockUpdateSessionStatus).not.toHaveBeenCalled();
      
      // Check for failure message
      expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('Failed to stop container'));
    });
    
    it('should handle errors during stop operation', async () => {
      // Setup mocks to throw error
      mockGetSession.mockReturnValue(mockRunningSession);
      mockIsContainerRunning.mockRejectedValue(new Error('Docker error'));
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'session1']);
      
      // Check for error message
      expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('Failed to stop session'));
    });
  });
  
  describe('stop all sessions', () => {
    it('should stop all running sessions', async () => {
      // Setup mocks with multiple running sessions
      const sessions = [
        mockRunningSession,
        { ...mockRunningSession, id: 'session2', containerId: 'container2' }
      ];
      mockListSessions.mockResolvedValue(sessions);
      mockIsContainerRunning.mockResolvedValue(true);
      mockStopContainer.mockResolvedValue(true);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'all']);
      
      // Check if sessions were listed
      expect(mockListSessions).toHaveBeenCalledWith({ status: 'running' });
      
      // Check if containers were checked and stopped
      expect(mockIsContainerRunning).toHaveBeenCalledTimes(2);
      expect(mockStopContainer).toHaveBeenCalledTimes(2);
      
      // Check if all session statuses were updated
      expect(mockUpdateSessionStatus).toHaveBeenCalledTimes(2);
      
      // Check for success message
      expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining('Stopped all 2 running sessions'));
    });
    
    it('should handle when no running sessions exist', async () => {
      // Setup mocks with no running sessions
      mockListSessions.mockResolvedValue([]);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'all']);
      
      // Check if sessions were listed
      expect(mockListSessions).toHaveBeenCalledWith({ status: 'running' });
      
      // Should not try to check or stop any containers
      expect(mockIsContainerRunning).not.toHaveBeenCalled();
      expect(mockStopContainer).not.toHaveBeenCalled();
      
      // Check for info message
      expect(mockSpinner.info).toHaveBeenCalledWith('No running sessions found.');
    });
    
    it('should remove all sessions when --remove option is provided', async () => {
      // Setup mocks
      const sessions = [
        mockRunningSession,
        { ...mockRunningSession, id: 'session2', containerId: 'container2' }
      ];
      mockListSessions.mockResolvedValue(sessions);
      mockIsContainerRunning.mockResolvedValue(true);
      mockStopContainer.mockResolvedValue(true);
      
      // Execute the command with remove option
      await program.parseAsync(['node', 'test', 'stop', 'all', '--remove']);
      
      // Check if all sessions were deleted
      expect(mockDeleteSession).toHaveBeenCalledTimes(2);
      
      // Check for note about removal
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Note:'));
    });
    
    it('should handle partial failures when stopping multiple sessions', async () => {
      // Setup mocks with one success and one failure
      const sessions = [
        mockRunningSession,
        { ...mockRunningSession, id: 'session2', containerId: 'container2' }
      ];
      mockListSessions.mockResolvedValue(sessions);
      mockIsContainerRunning.mockResolvedValue(true);
      
      // First container stops successfully, second fails
      mockStopContainer
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'all']);
      
      // Check if all containers were checked
      expect(mockIsContainerRunning).toHaveBeenCalledTimes(2);
      
      // Check if all containers were attempted to be stopped
      expect(mockStopContainer).toHaveBeenCalledTimes(2);
      
      // Only one session status should be updated
      expect(mockUpdateSessionStatus).toHaveBeenCalledTimes(1);
      
      // Check for warning message
      expect(mockSpinner.warn).toHaveBeenCalledWith(expect.stringContaining('Stopped 1 sessions, failed to stop 1 sessions'));
    });
    
    it('should update status for sessions marked as running but with non-running containers', async () => {
      // Setup mocks
      const sessions = [mockRunningSession];
      mockListSessions.mockResolvedValue(sessions);
      mockIsContainerRunning.mockResolvedValue(false);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'all']);
      
      // Check if session was listed and container status was checked
      expect(mockListSessions).toHaveBeenCalledWith({ status: 'running' });
      expect(mockIsContainerRunning).toHaveBeenCalledWith('container1');
      
      // Should not try to stop container that's not running
      expect(mockStopContainer).not.toHaveBeenCalled();
      
      // Session status should be updated
      expect(mockUpdateSessionStatus).toHaveBeenCalledWith('session1', 'stopped');
      
      // Check for success message
      expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining('Stopped all 1 running sessions'));
    });
    
    it('should handle errors during stop all operation', async () => {
      // Setup mocks to throw error
      mockListSessions.mockRejectedValue(new Error('Database error'));
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'stop', 'all']);
      
      // Check for error message
      expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('Failed to stop sessions'));
    });
  });
});