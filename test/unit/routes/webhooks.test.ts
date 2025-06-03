import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import webhookRoutes from '../../../src/routes/webhooks';
import { webhookRegistry } from '../../../src/core/webhook/WebhookRegistry';
import type { WebhookProvider } from '../../../src/types/webhook';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

// Mock secure credentials
jest.mock('../../../src/utils/secureCredentials', () => {
  const mock = jest.fn();
  return {
    default: {
      get: mock
    }
  };
});

// Mock the providers import to prevent auto-initialization
jest.mock('../../../src/providers/github', () => ({
  initializeGitHubProvider: jest.fn()
}));

describe('Webhook Routes', () => {
  let app: Express;
  let mockProvider: WebhookProvider;
  let mockSecureCredentialsGet: jest.Mock;

  beforeEach(() => {
    // Get the mock from the module
    const secureCredentialsMock = require('../../../src/utils/secureCredentials');
    mockSecureCredentialsGet = secureCredentialsMock.default.get;
    app = express();
    app.use(express.json());
    app.use('/api/webhooks', webhookRoutes);

    mockProvider = {
      name: 'github',
      verifySignature: jest.fn().mockResolvedValue(true),
      parsePayload: jest.fn().mockResolvedValue({
        id: 'test-123',
        timestamp: '2024-01-01T00:00:00Z',
        event: 'test.event',
        source: 'github',
        data: { test: 'data' }
      }),
      getEventType: jest.fn().mockReturnValue('test.event'),
      getEventDescription: jest.fn().mockReturnValue('Test event')
    };

    // Clear registry and mocks
    webhookRegistry.clear();
    jest.clearAllMocks();

    // Set default environment
    process.env.NODE_ENV = 'development';
    delete process.env.SKIP_WEBHOOK_VERIFICATION;
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.SKIP_WEBHOOK_VERIFICATION;
  });

  describe('POST /api/webhooks/:provider', () => {
    it('should reject invalid provider names', async () => {
      const response = await request(app)
        .post('/api/webhooks/invalid-provider')
        .send({ test: 'data' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Not found' });
    });

    it('should accept valid provider names', async () => {
      webhookRegistry.registerProvider(mockProvider);
      mockSecureCredentialsGet.mockReturnValue('test-secret');

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(200);
    });

    it('should require signature verification in production', async () => {
      process.env.NODE_ENV = 'production';
      webhookRegistry.registerProvider(mockProvider);
      mockSecureCredentialsGet.mockReturnValue(null);

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('should reject skip verification flag in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SKIP_WEBHOOK_VERIFICATION = '1';
      webhookRegistry.registerProvider(mockProvider);
      mockSecureCredentialsGet.mockReturnValue('test-secret');

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('should allow signature verification skip in test environment', async () => {
      process.env.NODE_ENV = 'test';
      webhookRegistry.registerProvider(mockProvider);
      mockSecureCredentialsGet.mockReturnValue(null);

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(200);
    });

    it('should allow skip verification flag in non-production', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SKIP_WEBHOOK_VERIFICATION = '1';
      webhookRegistry.registerProvider(mockProvider);
      mockSecureCredentialsGet.mockReturnValue(null);

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/webhooks/health', () => {
    it('should return health status with provider info', async () => {
      webhookRegistry.registerProvider(mockProvider);

      const response = await request(app).get('/api/webhooks/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'healthy',
        providers: [
          {
            name: 'github',
            handlerCount: 0
          }
        ]
      });
    });
  });
});
