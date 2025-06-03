import request from 'supertest';
import express from 'express';

// Mock child_process to prevent Docker commands
jest.mock('child_process', () => ({
  execSync: jest.fn(() => ''),
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, callback) => {
      if (event === 'close') {
        setTimeout(() => callback(0), 100);
      }
    })
  }))
}));

// Now we can import the routes
import webhookRoutes from '../../../src/routes/webhooks';

// Set environment variables for testing
process.env.CLAUDE_WEBHOOK_SECRET = 'test-claude-secret';
process.env.SKIP_WEBHOOK_VERIFICATION = '1';

describe('Claude Webhook Integration', () => {
  let app: express.Application;

  beforeAll(() => {
    // Import provider to register handlers
    require('../../../src/providers/claude');
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/webhooks', webhookRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/webhooks/claude', () => {
    it('should accept valid orchestration request', async () => {
      const payload = {
        data: {
          type: 'orchestrate',
          project: {
            repository: 'test-owner/test-repo',
            requirements: 'Build a simple REST API with authentication'
          },
          strategy: {
            parallelSessions: 3,
            phases: ['analysis', 'implementation', 'testing']
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-claude-secret')
        .send(payload)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Webhook processed',
        event: 'orchestrate'
      });

      expect(response.body.results).toBeDefined();
      expect(response.body.results[0].success).toBe(true);
    });

    it('should reject request without authorization', async () => {
      const payload = {
        data: {
          type: 'orchestrate',
          project: {
            repository: 'test-owner/test-repo',
            requirements: 'Build API'
          }
        }
      };

      // Remove skip verification for this test
      const originalSkip = process.env.SKIP_WEBHOOK_VERIFICATION;
      delete process.env.SKIP_WEBHOOK_VERIFICATION;

      const response = await request(app).post('/api/webhooks/claude').send(payload).expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized'
      });

      // Restore skip verification
      process.env.SKIP_WEBHOOK_VERIFICATION = originalSkip;
    });

    it('should handle session management request', async () => {
      const payload = {
        data: {
          type: 'session',
          sessionId: 'test-session-123',
          project: {
            repository: 'test-owner/test-repo',
            requirements: 'Manage session'
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-claude-secret')
        .send(payload)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Webhook processed',
        event: 'session'
      });
    });

    it('should reject invalid payload', async () => {
      const payload = {
        data: {
          // Missing type field
          invalid: 'data'
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-claude-secret')
        .send(payload)
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/webhooks/health', () => {
    it('should show Claude provider in health check', async () => {
      const response = await request(app).get('/api/webhooks/health').expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.providers).toBeDefined();

      const claudeProvider = response.body.providers.find((p: any) => p.name === 'claude');
      expect(claudeProvider).toBeDefined();
      expect(claudeProvider.handlerCount).toBeGreaterThan(0);
    });
  });
});
