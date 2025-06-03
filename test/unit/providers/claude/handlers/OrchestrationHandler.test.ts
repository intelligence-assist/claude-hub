import { OrchestrationHandler } from '../../../../../src/providers/claude/handlers/OrchestrationHandler';
import type { SessionManager } from '../../../../../src/providers/claude/services/SessionManager';
import type { ClaudeWebhookPayload } from '../../../../../src/providers/claude/ClaudeWebhookProvider';
import type { WebhookContext } from '../../../../../src/types/webhook';

// Mock the services
jest.mock('../../../../../src/providers/claude/services/SessionManager');

describe('OrchestrationHandler', () => {
  let handler: OrchestrationHandler;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockContext: WebhookContext;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new OrchestrationHandler();
    mockSessionManager = (handler as any).sessionManager;
    mockContext = {
      provider: 'claude',
      timestamp: new Date()
    };
  });

  describe('canHandle', () => {
    it('should handle orchestrate events', () => {
      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'orchestrate',
          project: {
            repository: 'owner/repo',
            requirements: 'Build API'
          }
        },
        metadata: {}
      };

      expect(handler.canHandle(payload)).toBe(true);
    });

    it('should not handle session events', () => {
      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'session.create',
          project: {
            repository: 'owner/repo',
            requirements: 'Manage session'
          }
        } as any,
        metadata: {}
      };

      expect(handler.canHandle(payload)).toBe(false);
    });
  });

  describe('handle', () => {
    it('should create orchestration session and start it by default', async () => {
      mockSessionManager.createContainer.mockResolvedValue('container-123');
      mockSessionManager.startSession.mockResolvedValue();

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'orchestrate',
          project: {
            repository: 'owner/repo',
            requirements: 'Build a REST API with authentication'
          }
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);
      expect(response.message).toBe('Orchestration session created');
      expect(response.data).toMatchObject({
        status: 'initiated',
        summary: 'Created orchestration session for owner/repo'
      });

      // Verify session creation
      const createdSession = mockSessionManager.createContainer.mock.calls[0][0];
      expect(createdSession).toMatchObject({
        type: 'coordination',
        status: 'pending',
        project: {
          repository: 'owner/repo',
          requirements: 'Build a REST API with authentication'
        },
        dependencies: []
      });

      // Verify session was started
      expect(mockSessionManager.startSession).toHaveBeenCalled();
    });

    it('should use custom session type when provided', async () => {
      mockSessionManager.createContainer.mockResolvedValue('container-123');
      mockSessionManager.startSession.mockResolvedValue();

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'orchestrate',
          sessionType: 'analysis',
          project: {
            repository: 'owner/repo',
            requirements: 'Analyze codebase structure'
          }
        } as any,
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);

      const createdSession = mockSessionManager.createContainer.mock.calls[0][0];
      expect(createdSession.type).toBe('analysis');
    });

    it('should not start session when autoStart is false', async () => {
      mockSessionManager.createContainer.mockResolvedValue('container-123');

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'orchestrate',
          autoStart: false,
          project: {
            repository: 'owner/repo',
            requirements: 'Build API'
          }
        } as any,
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(true);
      expect(mockSessionManager.createContainer).toHaveBeenCalled();
      expect(mockSessionManager.startSession).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockSessionManager.createContainer.mockRejectedValue(new Error('Docker error'));

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'orchestrate',
          project: {
            repository: 'owner/repo',
            requirements: 'Build API'
          }
        },
        metadata: {}
      };

      const response = await handler.handle(payload, mockContext);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Docker error');
    });

    it('should generate unique orchestration IDs', async () => {
      mockSessionManager.createContainer.mockResolvedValue('container-123');

      const payload: ClaudeWebhookPayload = {
        data: {
          type: 'orchestrate',
          autoStart: false,
          project: {
            repository: 'owner/repo',
            requirements: 'Build API'
          }
        } as any,
        metadata: {}
      };

      const response1 = await handler.handle(payload, mockContext);
      const response2 = await handler.handle(payload, mockContext);

      expect(response1.data?.orchestrationId).toBeDefined();
      expect(response2.data?.orchestrationId).toBeDefined();
      expect(response1.data?.orchestrationId).not.toBe(response2.data?.orchestrationId);
    });
  });
});
