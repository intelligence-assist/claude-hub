// Mock the WebhookProcessor
jest.mock('../../../src/core/webhook/WebhookProcessor');

// Mock the webhook registry to prevent any auto-initialization issues
jest.mock('../../../src/core/webhook/WebhookRegistry', () => {
  const mockRegistry = {
    registerProvider: jest.fn(),
    registerHandler: jest.fn(),
    getProvider: jest.fn(),
    getAllProviders: jest.fn().mockReturnValue([]),
    getHandlers: jest.fn().mockReturnValue([]),
    getHandlerCount: jest.fn().mockReturnValue(0),
    hasProvider: jest.fn().mockReturnValue(false),
    clear: jest.fn()
  };
  return {
    webhookRegistry: mockRegistry,
    WebhookRegistry: jest.fn(() => mockRegistry)
  };
});

// Mock the providers import to prevent auto-initialization
// This must be before any imports that might load the providers
jest.mock('../../../src/providers/github', () => ({
  initializeGitHubProvider: jest.fn()
}));

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

import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import type { WebhookProvider } from '../../../src/types/webhook';

// Get the mocked modules
const { webhookRegistry } = jest.requireMock('../../../src/core/webhook/WebhookRegistry');
const { WebhookProcessor } = jest.requireMock('../../../src/core/webhook/WebhookProcessor');

// Import routes after mocks are set up
import webhookRoutes from '../../../src/routes/webhooks';

describe('Webhook Routes', () => {
  let app: Express;
  let mockProvider: WebhookProvider;
  let mockSecureCredentialsGet: jest.Mock;
  let mockProcessWebhook: jest.Mock;

  beforeEach(() => {
    // Get the mock from the module
    const secureCredentialsMock = require('../../../src/utils/secureCredentials');
    mockSecureCredentialsGet = secureCredentialsMock.default.get;

    // Reset WebhookProcessor mock
    WebhookProcessor.mockClear();
    mockProcessWebhook = jest.fn().mockImplementation((_req, res, options) => {
      // Check if we should return 401 based on options
      if (options.provider === 'github' && !options.skipSignatureVerification && !options.secret) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      res.status(200).json({ message: 'Webhook processed', event: 'test.event' });
    });
    WebhookProcessor.mockImplementation(() => ({
      processWebhook: mockProcessWebhook
    }));

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

    // Clear mocks
    jest.clearAllMocks();

    // Reset the mock implementation for getProvider
    webhookRegistry.getProvider.mockImplementation((name: string) => {
      return name === 'github' && webhookRegistry.registerProvider.mock.calls.length > 0
        ? mockProvider
        : undefined;
    });

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

      if (response.status === 500) {
        console.error('Test failed with 500 error. Response body:', response.body);
        console.error('Response text:', response.text);
      }

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
      webhookRegistry.getAllProviders.mockReturnValue([mockProvider]);
      webhookRegistry.getHandlerCount.mockReturnValue(0);

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
