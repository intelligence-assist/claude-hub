import { Command } from 'commander';
import { registerRecoverCommand } from '../../src/commands/recover';
import { SessionManager } from '../../src/utils/sessionManager';
import { SessionConfig } from '../../src/types/session';
import ora from 'ora';

// Mock dependencies
jest.mock('../../src/utils/sessionManager');
jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    info: jest.fn().mockReturnThis(),
    text: ''
  };
  return jest.fn(() => mockSpinner);
});

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

describe('Recover Command', () => {
  let program: Command;
  let mockGetSession: jest.Mock;
  let mockRecoverSession: jest.Mock;
  let mockListSessions: jest.Mock;
  let mockSyncSessionStatuses: jest.Mock;
  let mockSpinner: { start: jest.Mock; succeed: jest.Mock; fail: jest.Mock; info: jest.Mock; };
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup program
    program = new Command();
    
    // Setup SessionManager mock
    mockGetSession = jest.fn();
    mockRecoverSession = jest.fn();
    mockListSessions = jest.fn();
    mockSyncSessionStatuses = jest.fn();
    (SessionManager as jest.Mock).mockImplementation(() => ({
      getSession: mockGetSession,
      recoverSession: mockRecoverSession,
      listSessions: mockListSessions,
      syncSessionStatuses: mockSyncSessionStatuses
    }));
    
    // Setup ora spinner mock
    mockSpinner = ora('') as unknown as { start: jest.Mock; succeed: jest.Mock; fail: jest.Mock; info: jest.Mock; };
    
    // Register the command
    registerRecoverCommand(program);
  });
  
  afterEach(() => {
    mockConsoleLog.mockClear();
  });
  
  const mockStoppedSession: SessionConfig = {
    id: 'session1',
    repoFullName: 'user/repo1',
    containerId: 'container1',
    command: 'help me with this code',
    status: 'stopped',
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-01T10:05:00Z'
  };
  
  const mockRunningSession: SessionConfig = {
    ...mockStoppedSession,
    status: 'running'
  };
  
  describe('recover command', () => {
    it('should recover a stopped session successfully', async () => {
      // Setup mocks
      mockGetSession.mockReturnValue(mockStoppedSession);
      mockRecoverSession.mockResolvedValue(true);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'recover', 'session1']);
      
      // Check if session was retrieved
      expect(mockGetSession).toHaveBeenCalledWith('session1');
      
      // Check if recover was called
      expect(mockRecoverSession).toHaveBeenCalledWith('session1');
      
      // Check for success message
      expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining('Recovered session'));
      
      // Check that session details were printed
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Session details:'));
    });
    
    it('should handle PR session details when recovering', async () => {
      // Setup mocks with PR session
      const prSession = {
        ...mockStoppedSession,
        isPullRequest: true,
        prNumber: 42,
        branchName: 'feature/new-feature'
      };
      mockGetSession.mockReturnValue(prSession);
      mockRecoverSession.mockResolvedValue(true);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'recover', 'session1']);
      
      // Check for PR-specific details
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PR:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Branch:'));
    });
    
    it('should handle Issue session details when recovering', async () => {
      // Setup mocks with Issue session
      const issueSession = {
        ...mockStoppedSession,
        isIssue: true,
        issueNumber: 123
      };
      mockGetSession.mockReturnValue(issueSession);
      mockRecoverSession.mockResolvedValue(true);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'recover', 'session1']);
      
      // Check for Issue-specific details
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Issue:'));
    });
    
    it('should fail when session does not exist', async () => {
      // Setup mocks
      mockGetSession.mockReturnValue(null);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'recover', 'nonexistent']);
      
      // Check if session was retrieved
      expect(mockGetSession).toHaveBeenCalledWith('nonexistent');
      
      // Should not try to recover
      expect(mockRecoverSession).not.toHaveBeenCalled();
      
      // Check for failure message
      expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
    
    it('should not recover when session is not stopped', async () => {
      // Setup mocks with running session
      mockGetSession.mockReturnValue(mockRunningSession);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'recover', 'session1']);
      
      // Check if session was retrieved
      expect(mockGetSession).toHaveBeenCalledWith('session1');
      
      // Should not try to recover
      expect(mockRecoverSession).not.toHaveBeenCalled();
      
      // Check for info message
      expect(mockSpinner.info).toHaveBeenCalledWith(expect.stringContaining('not stopped'));
    });
    
    it('should handle failed recovery', async () => {
      // Setup mocks
      mockGetSession.mockReturnValue(mockStoppedSession);
      mockRecoverSession.mockResolvedValue(false);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'recover', 'session1']);
      
      // Check if session was retrieved and recover was attempted
      expect(mockGetSession).toHaveBeenCalledWith('session1');
      expect(mockRecoverSession).toHaveBeenCalledWith('session1');
      
      // Check for failure message
      expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('Failed to recover'));
    });
    
    it('should handle errors during recovery', async () => {
      // Setup mocks to throw error
      mockGetSession.mockReturnValue(mockStoppedSession);
      mockRecoverSession.mockRejectedValue(new Error('Recovery failed'));
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'recover', 'session1']);
      
      // Check for error message
      expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('Error recovering session'));
    });
  });
  
  describe('sync command', () => {
    it('should sync session statuses successfully', async () => {
      // Setup mocks
      mockSyncSessionStatuses.mockResolvedValue(true);
      mockListSessions.mockResolvedValue([
        mockRunningSession,
        { ...mockStoppedSession, id: 'session2' }
      ]);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'sync']);
      
      // Check if sync was called
      expect(mockSyncSessionStatuses).toHaveBeenCalled();
      
      // Check for success message
      expect(mockSpinner.succeed).toHaveBeenCalledWith(expect.stringContaining('Synchronized'));
      
      // Check that session counts were printed
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Running sessions:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Stopped sessions:'));
    });
    
    it('should show recover help when stopped sessions exist', async () => {
      // Setup mocks with stopped sessions
      mockSyncSessionStatuses.mockResolvedValue(true);
      mockListSessions.mockResolvedValue([
        { ...mockStoppedSession, id: 'session2' }
      ]);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'sync']);
      
      // Check that recover help was printed
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('To recover a stopped session:'));
    });
    
    it('should not show recover help when no stopped sessions exist', async () => {
      // Setup mocks with only running sessions
      mockSyncSessionStatuses.mockResolvedValue(true);
      mockListSessions.mockResolvedValue([mockRunningSession]);
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'sync']);
      
      // Check that session counts were printed
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Running sessions: 1'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Stopped sessions: 0'));
      
      // Recover help should not be printed
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('To recover a stopped session:'));
    });
    
    it('should handle errors during sync', async () => {
      // Setup mocks to throw error
      mockSyncSessionStatuses.mockRejectedValue(new Error('Sync failed'));
      
      // Execute the command
      await program.parseAsync(['node', 'test', 'sync']);
      
      // Check for error message
      expect(mockSpinner.fail).toHaveBeenCalledWith(expect.stringContaining('Error synchronizing sessions'));
    });
  });
});