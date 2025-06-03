import { ClaudeWebhookProvider } from '../../../../src/providers/claude/ClaudeWebhookProvider';
import type { ClaudeWebhookPayload } from '../../../../src/providers/claude/ClaudeWebhookProvider';
import type { WebhookRequest } from '../../../../src/types/express';

describe('ClaudeWebhookProvider', () => {
  let provider: ClaudeWebhookProvider;

  beforeEach(() => {
    provider = new ClaudeWebhookProvider();
  });

  describe('verifySignature', () => {
    it('should verify valid bearer token', async () => {
      const req = {
        headers: {
          authorization: 'Bearer test-secret'
        }
      } as WebhookRequest;

      const result = await provider.verifySignature(req, 'test-secret');
      expect(result).toBe(true);
    });

    it('should reject missing authorization header', async () => {
      const req = {
        headers: {}
      } as WebhookRequest;

      const result = await provider.verifySignature(req, 'test-secret');
      expect(result).toBe(false);
    });

    it('should reject invalid token', async () => {
      const req = {
        headers: {
          authorization: 'Bearer wrong-token'
        }
      } as WebhookRequest;

      const result = await provider.verifySignature(req, 'test-secret');
      expect(result).toBe(false);
    });

    it('should reject non-bearer auth', async () => {
      const req = {
        headers: {
          authorization: 'Basic test-secret'
        }
      } as WebhookRequest;

      const result = await provider.verifySignature(req, 'test-secret');
      expect(result).toBe(false);
    });
  });

  describe('parsePayload', () => {
    it('should parse valid orchestration request', async () => {
      const req = {
        body: {
          type: 'orchestrate',
          project: {
            repository: 'owner/repo',
            requirements: 'Build a REST API'
          }
        }
      } as WebhookRequest;

      const result = await provider.parsePayload(req);

      expect(result.event).toBe('orchestrate');
      expect(result.source).toBe('claude');
      expect(result.data.type).toBe('orchestrate');
      expect(result.data.project.repository).toBe('owner/repo');
      expect(result.data.project.requirements).toBe('Build a REST API');
      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should parse session management request', async () => {
      const req = {
        body: {
          type: 'session',
          project: {
            repository: 'owner/repo',
            requirements: 'Manage session'
          },
          sessionId: 'test-session-123'
        }
      } as WebhookRequest;

      const result = await provider.parsePayload(req);

      expect(result.event).toBe('session');
      expect(result.data.type).toBe('session');
      expect(result.data.sessionId).toBe('test-session-123');
    });

    it('should throw on missing required fields', async () => {
      const req = {
        body: {
          type: 'orchestrate'
          // Missing project
        }
      } as WebhookRequest;

      await expect(provider.parsePayload(req)).rejects.toThrow(
        'Invalid payload: missing required fields'
      );
    });

    it('should throw on missing repository', async () => {
      const req = {
        body: {
          type: 'orchestrate',
          project: {
            requirements: 'Build something'
            // Missing repository
          }
        }
      } as WebhookRequest;

      await expect(provider.parsePayload(req)).rejects.toThrow(
        'Invalid payload: missing required fields'
      );
    });
  });

  describe('getEventType', () => {
    it('should return the event type', () => {
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

      expect(provider.getEventType(payload)).toBe('orchestrate');
    });
  });

  describe('getEventDescription', () => {
    it('should describe orchestrate event', () => {
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

      expect(provider.getEventDescription(payload)).toBe(
        'Orchestrate Claude sessions for owner/repo'
      );
    });

    it('should describe session event', () => {
      const payload: ClaudeWebhookPayload = {
        id: 'test-id',
        timestamp: new Date().toISOString(),
        event: 'session',
        source: 'claude',
        data: {
          type: 'session',
          sessionId: 'session-123',
          project: {
            repository: 'owner/repo',
            requirements: 'Manage session'
          }
        }
      };

      expect(provider.getEventDescription(payload)).toBe('Manage Claude session session-123');
    });

    it('should describe coordinate event', () => {
      const payload: ClaudeWebhookPayload = {
        id: 'test-id',
        timestamp: new Date().toISOString(),
        event: 'coordinate',
        source: 'claude',
        data: {
          type: 'coordinate',
          project: {
            repository: 'owner/repo',
            requirements: 'Coordinate sessions'
          }
        }
      };

      expect(provider.getEventDescription(payload)).toBe(
        'Coordinate Claude sessions for owner/repo'
      );
    });
  });
});
