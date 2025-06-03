import { SessionManager } from '../../../../../src/providers/claude/services/SessionManager';
import { execSync, spawn } from 'child_process';
import type { ClaudeSession } from '../../../../../src/types/claude-orchestration';

// Mock child_process
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawn: jest.fn()
}));

// Mock logger
jest.mock('../../../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
  const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionManager = new SessionManager();

    // Setup default mocks
    mockExecSync.mockReturnValue(Buffer.from(''));
    mockSpawn.mockReturnValue({
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn()
    } as any);
  });

  describe('createContainer', () => {
    it('should create a container for a session', async () => {
      const session: ClaudeSession = {
        id: 'test-session-123',
        type: 'analysis',
        status: 'pending',
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      const containerName = await sessionManager.createContainer(session);

      expect(containerName).toBe('claude-analysis-test-ses');
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('docker create'), {
        stdio: 'pipe'
      });
    });

    it('should handle errors when creating container', () => {
      const session: ClaudeSession = {
        id: 'test-session-123',
        type: 'analysis',
        status: 'pending',
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      mockExecSync.mockImplementation(() => {
        throw new Error('Docker error');
      });

      expect(() => sessionManager.createContainer(session)).toThrow('Docker error');
    });
  });

  describe('startSession', () => {
    it('should start a session with a container', async () => {
      const session: ClaudeSession = {
        id: 'test-session-123',
        type: 'implementation',
        status: 'pending',
        containerId: 'container-123',
        project: {
          repository: 'owner/repo',
          requirements: 'Implement feature X',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      // Mock spawn to simulate successful execution
      const mockProcess = {
        stdout: {
          on: jest.fn((event, cb) => {
            if (event === 'data') cb(Buffer.from('Output line'));
          })
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'close') cb(0);
        })
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await sessionManager.startSession(session);

      expect(mockExecSync).toHaveBeenCalledWith('docker start container-123', { stdio: 'pipe' });
      expect(mockSpawn).toHaveBeenCalledWith(
        'docker',
        ['exec', '-i', 'container-123', 'claude', 'chat', '--no-prompt', '-m', expect.any(String)],
        expect.any(Object)
      );
    });

    it('should throw error if session has no container ID', () => {
      const session: ClaudeSession = {
        id: 'test-session-123',
        type: 'testing',
        status: 'pending',
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      expect(() => sessionManager.startSession(session)).toThrow('Session has no container ID');
    });
  });

  describe('getSession', () => {
    it('should return a session by ID', async () => {
      const session: ClaudeSession = {
        id: 'test-session-123',
        type: 'review',
        status: 'pending',
        project: {
          repository: 'owner/repo',
          requirements: 'Review code',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      await sessionManager.createContainer(session);
      const retrieved = sessionManager.getSession('test-session-123');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-session-123');
    });

    it('should return undefined for non-existent session', () => {
      const retrieved = sessionManager.getSession('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllSessions', () => {
    it('should return all sessions', async () => {
      const session1: ClaudeSession = {
        id: 'session-1',
        type: 'analysis',
        status: 'pending',
        project: {
          repository: 'owner/repo1',
          requirements: 'Analyze',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      const session2: ClaudeSession = {
        id: 'session-2',
        type: 'implementation',
        status: 'pending',
        project: {
          repository: 'owner/repo2',
          requirements: 'Implement',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      await sessionManager.createContainer(session1);
      await sessionManager.createContainer(session2);

      const allSessions = sessionManager.getAllSessions();
      expect(allSessions).toHaveLength(2);
      expect(allSessions.map(s => s.id)).toEqual(['session-1', 'session-2']);
    });
  });

  describe('getOrchestrationSessions', () => {
    it('should return sessions for a specific orchestration', async () => {
      const session1: ClaudeSession = {
        id: 'orch-123-session-1',
        type: 'analysis',
        status: 'pending',
        project: {
          repository: 'owner/repo',
          requirements: 'Analyze',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      const session2: ClaudeSession = {
        id: 'orch-123-session-2',
        type: 'implementation',
        status: 'pending',
        project: {
          repository: 'owner/repo',
          requirements: 'Implement',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      const otherSession: ClaudeSession = {
        id: 'orch-456-session-1',
        type: 'testing',
        status: 'pending',
        project: {
          repository: 'owner/repo',
          requirements: 'Test',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      await sessionManager.createContainer(session1);
      await sessionManager.createContainer(session2);
      await sessionManager.createContainer(otherSession);

      const orchSessions = sessionManager.getOrchestrationSessions('orch-123');
      expect(orchSessions).toHaveLength(2);
      expect(orchSessions.map(s => s.id)).toEqual(['orch-123-session-1', 'orch-123-session-2']);
    });
  });

  describe('queueSession', () => {
    it('should start session immediately if no dependencies', async () => {
      const session: ClaudeSession = {
        id: 'test-session',
        type: 'analysis',
        status: 'pending',
        containerId: 'container-123',
        project: {
          repository: 'owner/repo',
          requirements: 'Analyze',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => {
          if (event === 'close') cb(0);
        })
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await sessionManager.queueSession(session);

      expect(mockExecSync).toHaveBeenCalledWith('docker start container-123', { stdio: 'pipe' });
    });

    it('should queue session if dependencies not met', async () => {
      const depSession: ClaudeSession = {
        id: 'dep-session',
        type: 'analysis',
        status: 'running',
        project: {
          repository: 'owner/repo',
          requirements: 'Analyze',
          constraints: []
        },
        dependencies: [],
        createdAt: new Date()
      };

      const session: ClaudeSession = {
        id: 'test-session',
        type: 'implementation',
        status: 'pending',
        containerId: 'container-123',
        project: {
          repository: 'owner/repo',
          requirements: 'Implement',
          constraints: []
        },
        dependencies: ['dep-session'],
        createdAt: new Date()
      };

      await sessionManager.createContainer(depSession);
      await sessionManager.queueSession(session);

      // Should not start immediately
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });
});
