import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import { SessionManager } from '../../src/utils/sessionManager';
import { SessionConfig, SessionStatus } from '../../src/types/session';
import { DockerUtils } from '../../src/utils/dockerUtils';

// Mock DockerUtils
jest.mock('../../src/utils/dockerUtils');

// Type for mocked DockerUtils
type MockedDockerUtils = {
  isContainerRunning: jest.MockedFunction<DockerUtils['isContainerRunning']>;
  startContainer: jest.MockedFunction<DockerUtils['startContainer']>;
};

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  const sessionsDir = path.join(process.env.HOME as string, '.claude-hub', 'sessions');
  
  // Sample session data
  const sampleSession: Omit<SessionConfig, 'id' | 'createdAt' | 'updatedAt'> = {
    repoFullName: 'test/repo',
    containerId: 'test-container-id',
    command: 'analyze this code',
    status: 'running' as SessionStatus
  };

  // Mock DockerUtils implementation
  const mockDockerUtils = DockerUtils as jest.MockedClass<typeof DockerUtils>;
  let mockDockerInstance: MockedDockerUtils;

  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
    
    // Setup mock DockerUtils instance
    mockDockerInstance = {
      isContainerRunning: jest.fn(),
      startContainer: jest.fn()
    } as unknown as MockedDockerUtils;
    
    mockDockerUtils.mockImplementation(() => mockDockerInstance as any);
    
    // Default mock implementation
    mockDockerInstance.isContainerRunning.mockResolvedValue(true);
    mockDockerInstance.startContainer.mockResolvedValue('new-container-id');
    
    // Setup mock file system
    const testHomeDir = process.env.HOME as string;
    const claudeHubDir = path.join(testHomeDir, '.claude-hub');
    mockFs({
      [testHomeDir]: {},
      [claudeHubDir]: {},
      [sessionsDir]: {} // Empty directory
    });
    
    // Create fresh instance for each test
    sessionManager = new SessionManager();
  });
  
  afterEach(() => {
    // Restore real file system
    mockFs.restore();
  });

  describe('createSession', () => {
    it('should create a new session with a generated ID', () => {
      const session = sessionManager.createSession(sampleSession);
      
      expect(session).toHaveProperty('id');
      expect(session.repoFullName).toBe('test/repo');
      expect(session.containerId).toBe('test-container-id');
      expect(session.command).toBe('analyze this code');
      expect(session.status).toBe('running');
      expect(session).toHaveProperty('createdAt');
      expect(session).toHaveProperty('updatedAt');
    });
    
    it('should save the session to disk', () => {
      // We need to spy on the filesystem write operation
      const spy = jest.spyOn(fs, 'writeFileSync');
      
      const session = sessionManager.createSession(sampleSession);
      
      // Verify the write operation was called with the correct arguments
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0]).toContain(`${session.id}.json`);
      
      // Check that the content passed to writeFileSync is correct
      const writtenContent = JSON.parse(spy.mock.calls[0][1] as string);
      expect(writtenContent).toEqual(session);
      
      // Clean up
      spy.mockRestore();
    });
  });
  
  describe('getSession', () => {
    it('should retrieve a session by ID', () => {
      const session = sessionManager.createSession(sampleSession);
      const retrievedSession = sessionManager.getSession(session.id);
      
      expect(retrievedSession).toEqual(session);
    });
    
    it('should return null for a non-existent session', () => {
      const retrievedSession = sessionManager.getSession('non-existent');
      
      expect(retrievedSession).toBeNull();
    });
  });
  
  describe('updateSessionStatus', () => {
    it('should update the status of a session', () => {
      const session = sessionManager.createSession(sampleSession);
      const result = sessionManager.updateSessionStatus(session.id, 'completed');
      
      expect(result).toBe(true);
      
      const updatedSession = sessionManager.getSession(session.id);
      expect(updatedSession?.status).toBe('completed');
    });
    
    it('should return false for a non-existent session', () => {
      const result = sessionManager.updateSessionStatus('non-existent', 'completed');
      
      expect(result).toBe(false);
    });
  });
  
  describe('deleteSession', () => {
    it('should delete a session', () => {
      const session = sessionManager.createSession(sampleSession);
      const result = sessionManager.deleteSession(session.id);
      
      expect(result).toBe(true);
      
      const filePath = path.join(sessionsDir, `${session.id}.json`);
      expect(fs.existsSync(filePath)).toBe(false);
    });
    
    it('should return false for a non-existent session', () => {
      const result = sessionManager.deleteSession('non-existent');
      
      expect(result).toBe(false);
    });
  });
  
  describe('listSessions', () => {
    beforeEach(() => {
      // Create multiple sessions for testing
      sessionManager.createSession({
        ...sampleSession,
        repoFullName: 'test/repo1',
        status: 'running'
      });
      
      sessionManager.createSession({
        ...sampleSession,
        repoFullName: 'test/repo2',
        status: 'completed'
      });
      
      sessionManager.createSession({
        ...sampleSession,
        repoFullName: 'other/repo',
        status: 'running'
      });
    });
    
    it('should list all sessions', async () => {
      const sessions = await sessionManager.listSessions();
      
      expect(sessions.length).toBe(3);
    });
    
    it('should filter sessions by status', async () => {
      const sessions = await sessionManager.listSessions({ status: 'running' });
      
      expect(sessions.length).toBe(2);
      expect(sessions.every(s => s.status === 'running')).toBe(true);
    });
    
    it('should filter sessions by repo', async () => {
      const sessions = await sessionManager.listSessions({ repo: 'test' });
      
      expect(sessions.length).toBe(2);
      expect(sessions.every(s => s.repoFullName.includes('test'))).toBe(true);
    });
    
    it('should apply limit to results', async () => {
      const sessions = await sessionManager.listSessions({ limit: 2 });
      
      expect(sessions.length).toBe(2);
    });
    
    it('should verify running container status', async () => {
      // Mock container not running for one session
      mockDockerInstance.isContainerRunning.mockImplementation(async (containerId) => {
        return containerId !== 'test-container-id';
      });
      
      const sessions = await sessionManager.listSessions();
      
      // At least one session should be updated to stopped
      expect(sessions.some(s => s.status === 'stopped')).toBe(true);
    });
  });
  
  describe('recoverSession', () => {
    let stoppedSessionId: string;
    
    beforeEach(() => {
      // Create a stopped session for recovery testing
      const session = sessionManager.createSession({
        ...sampleSession,
        status: 'stopped'
      });
      stoppedSessionId = session.id;
    });
    
    it('should recover a stopped session', async () => {
      const result = await sessionManager.recoverSession(stoppedSessionId);
      
      expect(result).toBe(true);
      expect(mockDockerInstance.startContainer).toHaveBeenCalled();
      
      const updatedSession = sessionManager.getSession(stoppedSessionId);
      expect(updatedSession?.status).toBe('running');
      expect(updatedSession?.containerId).toBe('new-container-id');
    });
    
    it('should fail to recover a non-existent session', async () => {
      const result = await sessionManager.recoverSession('non-existent');
      
      expect(result).toBe(false);
      expect(mockDockerInstance.startContainer).not.toHaveBeenCalled();
    });
    
    it('should fail to recover a running session', async () => {
      // Create a running session
      const session = sessionManager.createSession({
        ...sampleSession,
        status: 'running'
      });
      
      const result = await sessionManager.recoverSession(session.id);
      
      expect(result).toBe(false);
      expect(mockDockerInstance.startContainer).not.toHaveBeenCalled();
    });
  });
  
  describe('syncSessionStatuses', () => {
    beforeEach(() => {
      // Create multiple sessions for testing
      sessionManager.createSession({
        ...sampleSession,
        containerId: 'running-container',
        status: 'running'
      });
      
      sessionManager.createSession({
        ...sampleSession,
        containerId: 'stopped-container',
        status: 'running'
      });
    });
    
    it('should sync session statuses with container states', async () => {
      // Mock container running check
      mockDockerInstance.isContainerRunning.mockImplementation(async (containerId) => {
        return containerId === 'running-container';
      });
      
      await sessionManager.syncSessionStatuses();
      
      // Get all sessions after sync
      const sessions = await sessionManager.listSessions();
      
      // Should have one running and one stopped session
      expect(sessions.filter(s => s.status === 'running').length).toBe(1);
      expect(sessions.filter(s => s.status === 'stopped').length).toBe(1);
    });
  });
});