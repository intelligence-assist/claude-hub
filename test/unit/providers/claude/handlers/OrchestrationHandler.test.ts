import { OrchestrationHandler } from '../../../../../src/providers/claude/handlers/OrchestrationHandler';
import type { ClaudeWebhookPayload } from '../../../../../src/providers/claude/ClaudeWebhookProvider';
import type { WebhookContext } from '../../../../../src/types/webhook';

// Mock the services
jest.mock('../../../../../src/providers/claude/services/SessionManager');
jest.mock('../../../../../src/providers/claude/services/TaskDecomposer');

describe('OrchestrationHandler', () => {
  let handler: OrchestrationHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new OrchestrationHandler();
  });

  describe('canHandle', () => {
    it('should handle orchestrate events', () => {
      const payload: ClaudeWebhookPayload = {
        id: 'test-id',
        timestamp: new Date().toISOString(),
        event: 'orchestrate',
        source: 'claude',
        data: {
          type: 'orchestrate',
          project: {
            repository: 'owner/repo',
            requirements: 'Build API'
          }
        }
      };

      expect(handler.canHandle(payload)).toBe(true);
    });

    it('should not handle session events', () => {
      const payload: ClaudeWebhookPayload = {
        id: 'test-id',
        timestamp: new Date().toISOString(),
        event: 'session',
        source: 'claude',
        data: {
          type: 'session',
          project: {
            repository: 'owner/repo',
            requirements: 'Manage session'
          }
        }
      };

      expect(handler.canHandle(payload)).toBe(false);
    });

    it('should not handle coordinate events', () => {
      const payload: ClaudeWebhookPayload = {
        id: 'test-id',
        timestamp: new Date().toISOString(),
        event: 'coordinate',
        source: 'claude',
        data: {
          type: 'coordinate',
          project: {
            repository: 'owner/repo',
            requirements: 'Coordinate'
          }
        }
      };

      expect(handler.canHandle(payload)).toBe(false);
    });
  });

  describe('handle', () => {
    const mockContext: WebhookContext = {
      provider: 'claude',
      authenticated: true,
      metadata: {
        eventType: 'orchestrate',
        payloadId: 'test-id',
        timestamp: new Date().toISOString()
      }
    };

    it('should successfully orchestrate sessions', async () => {
      const payload: ClaudeWebhookPayload = {
        id: 'test-id',
        timestamp: new Date().toISOString(),
        event: 'orchestrate',
        source: 'claude',
        data: {
          type: 'orchestrate',
          project: {
            repository: 'owner/repo',
            requirements: 'Build a REST API with authentication'
          },
          strategy: {
            parallelSessions: 3,
            phases: ['analysis', 'implementation', 'testing'],
            dependencyMode: 'parallel'
          }
        }
      };

      const result = await handler.handle(payload, mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Orchestration initiated successfully');
      expect(result.data).toBeDefined();

      const data = result.data as any;
      expect(data.orchestrationId).toBeDefined();
      expect(data.status).toBe('initiated');
      expect(data.sessions).toBeDefined();
      expect(Array.isArray(data.sessions)).toBe(true);
    });

    it('should handle orchestration without strategy', async () => {
      const payload: ClaudeWebhookPayload = {
        id: 'test-id',
        timestamp: new Date().toISOString(),
        event: 'orchestrate',
        source: 'claude',
        data: {
          type: 'orchestrate',
          project: {
            repository: 'owner/repo',
            requirements: 'Build simple feature'
          }
        }
      };

      const result = await handler.handle(payload, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const payload: ClaudeWebhookPayload = {
        id: 'test-id',
        timestamp: new Date().toISOString(),
        event: 'orchestrate',
        source: 'claude',
        data: {
          type: 'orchestrate',
          project: {
            repository: 'owner/repo',
            requirements: 'Build API'
          }
        }
      };

      // Mock TaskDecomposer to throw an error
      const TaskDecomposer =
        require('../../../../../src/providers/claude/services/TaskDecomposer').TaskDecomposer;
      TaskDecomposer.prototype.decompose.mockRejectedValueOnce(new Error('Decomposition failed'));

      const result = await handler.handle(payload, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Decomposition failed');
    });
  });
});
