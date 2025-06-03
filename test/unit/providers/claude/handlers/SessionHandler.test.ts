import { SessionHandler } from '../../../../../src/providers/claude/handlers/SessionHandler';
import type { SessionManager } from '../../../../../src/providers/claude/services/SessionManager';
import type { ClaudeWebhookPayload } from '../../../../../src/providers/claude/ClaudeWebhookProvider';
import type { WebhookContext } from '../../../../../src/types/webhook';

// Mock SessionManager
jest.mock('../../../../../src/providers/claude/services/SessionManager');

describe('SessionHandler', () => {
  let handler: SessionHandler;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockContext: WebhookContext;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new SessionHandler();
    mockSessionManager = (handler as any).sessionManager;
    mockContext = {
      provider: 'claude',
      timestamp: new Date()
    };
  });

  describe('canHandle', () => {
    it('should handle session.* events', () => {
      const payload: ClaudeWebhookPayload = {
        data: { type: 'session.create' } as any,
        metadata: {}
      };
      expect(handler.canHandle(payload)).toBe(true);
    });

    it('should not handle non-session events', () => {
      const payload: ClaudeWebhookPayload = {
        data: { type: 'orchestrate' } as any,
        metadata: {}
      };
      expect(handler.canHandle(payload)).toBe(false);
    });
  });

  describe('session.create', () => {
    it('should create a new session', async () => {
      mockSessionManager.createContainer.mockResolvedValue('container-123');

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              repository: 'owner/repo',
              requirements: 'Test requirements'
            }
          }
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);
      expect(response.data?.session).toMatchObject({
        type: 'implementation',
        status: 'initializing',
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements'
        },
        containerId: 'container-123'
      });
      expect(mockSessionManager.createContainer).toHaveBeenCalled();
    });

    it('should fail without repository', async () => {
      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              requirements: 'Test requirements'
            } as any
          }
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Repository is required for session creation');
    });

    it('should fail without requirements', async () => {
      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              repository: 'owner/repo'
            } as any
          }
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Requirements are required for session creation');
    });
  });

  describe('session.get', () => {
    it('should get existing session', async () => {
      const mockSession = {
        id: 'test-session-123',
        type: 'implementation' as const,
        status: 'running' as const,
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements'
        },
        dependencies: []
      };

      mockSessionManager.getSession.mockReturnValue(mockSession);

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.get',
          sessionId: 'test-session-123'
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);
      expect(response.data?.session).toEqual(mockSession);
    });

    it('should return error for non-existent session', async () => {
      mockSessionManager.getSession.mockReturnValue(undefined);

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.get',
          sessionId: 'non-existent'
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Session not found: non-existent');
    });
  });

  describe('session.list', () => {
    it('should list all sessions', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          type: 'implementation' as const,
          status: 'running' as const,
          project: { repository: 'owner/repo', requirements: 'Test' },
          dependencies: []
        },
        {
          id: 'session-2',
          type: 'testing' as const,
          status: 'pending' as const,
          project: { repository: 'owner/repo', requirements: 'Test' },
          dependencies: ['session-1']
        }
      ];

      mockSessionManager.getAllSessions.mockReturnValue(mockSessions);

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.list'
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);
      expect(response.data?.sessions).toEqual(mockSessions);
    });

    it('should list sessions by orchestration ID', async () => {
      const mockSessions = [
        {
          id: 'orch-123-impl',
          type: 'implementation' as const,
          status: 'running' as const,
          project: { repository: 'owner/repo', requirements: 'Test' },
          dependencies: []
        }
      ];

      mockSessionManager.getOrchestrationSessions.mockReturnValue(mockSessions);

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.list',
          orchestrationId: 'orch-123'
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);
      expect(response.data?.sessions).toEqual(mockSessions);
      expect(mockSessionManager.getOrchestrationSessions).toHaveBeenCalledWith('orch-123');
    });
  });

  describe('session.start', () => {
    it('should start a session without dependencies', async () => {
      const mockSession = {
        id: 'test-session-123',
        type: 'implementation' as const,
        status: 'initializing' as const,
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements'
        },
        dependencies: []
      };

      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSessionManager.startSession.mockResolvedValue();

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.start',
          sessionId: 'test-session-123'
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);
      expect(response.message).toBe('Session started');
      expect(mockSessionManager.startSession).toHaveBeenCalledWith(mockSession);
    });

    it('should queue session with unmet dependencies', async () => {
      const mockSession = {
        id: 'test-session-123',
        type: 'testing' as const,
        status: 'pending' as const,
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements'
        },
        dependencies: ['dep-1', 'dep-2']
      };

      const mockDep1 = {
        id: 'dep-1',
        status: 'completed' as const
      };

      const mockDep2 = {
        id: 'dep-2',
        status: 'running' as const // Not completed
      };

      mockSessionManager.getSession
        .mockReturnValueOnce(mockSession)
        .mockReturnValueOnce(mockDep1 as any)
        .mockReturnValueOnce(mockDep2 as any);
      mockSessionManager.queueSession.mockResolvedValue();

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.start',
          sessionId: 'test-session-123'
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);
      expect(response.message).toBe('Session queued, waiting for dependencies');
      expect(response.data?.waitingFor).toEqual(['dep-2']);
      expect(mockSessionManager.queueSession).toHaveBeenCalledWith(mockSession);
    });

    it('should fail for invalid session status', async () => {
      const mockSession = {
        id: 'test-session-123',
        type: 'implementation' as const,
        status: 'completed' as const,
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements'
        },
        dependencies: []
      };

      mockSessionManager.getSession.mockReturnValue(mockSession);

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.start',
          sessionId: 'test-session-123'
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Session cannot be started in status: completed');
    });
  });

  describe('session.output', () => {
    it('should get session output', async () => {
      const mockOutput = {
        logs: ['Line 1', 'Line 2'],
        artifacts: [{ type: 'file' as const, path: 'src/test.ts' }],
        summary: 'Task completed',
        nextSteps: ['Run tests']
      };

      const mockSession = {
        id: 'test-session-123',
        type: 'implementation' as const,
        status: 'completed' as const,
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements'
        },
        dependencies: [],
        output: mockOutput
      };

      mockSessionManager.getSession.mockReturnValue(mockSession);

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.output',
          sessionId: 'test-session-123'
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);
      expect(response.data?.output).toEqual(mockOutput);
      expect(response.data?.status).toBe('completed');
    });

    it('should handle session without output', async () => {
      const mockSession = {
        id: 'test-session-123',
        type: 'implementation' as const,
        status: 'running' as const,
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements'
        },
        dependencies: [],
        output: undefined
      };

      mockSessionManager.getSession.mockReturnValue(mockSession);

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.output',
          sessionId: 'test-session-123'
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);
      expect(response.data?.output).toBeNull();
      expect(response.data?.message).toBe('Session has no output yet');
    });
  });

  describe('error handling', () => {
    it('should handle unknown session operation', async () => {
      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.unknown'
        } as any,
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Unknown session operation: session.unknown');
    });

    it('should handle errors gracefully', async () => {
      mockSessionManager.createContainer.mockRejectedValue(new Error('Docker error'));

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              repository: 'owner/repo',
              requirements: 'Test requirements'
            }
          }
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Docker error');
    });
  });
});
