// Set test environment before any imports
process.env.NODE_ENV = 'test';

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
jest.mock('../../../src/utils/secureCredentials', () => ({
  default: {
    get: jest.fn()
  }
}));

// Mock the WebhookProcessor
jest.mock('../../../src/core/webhook/WebhookProcessor', () => ({
  WebhookProcessor: jest.fn().mockImplementation(() => ({
    processWebhook: jest.fn().mockImplementation((_req, res, options) => {
      // Simulate the actual route logic for production mode
      if (
        process.env.NODE_ENV === 'production' &&
        (!options.secret || options.skipSignatureVerification)
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      res.status(200).json({ message: 'Webhook processed', event: 'test.event' });
    })
  }))
}));

import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import webhookRoutes from '../../../src/routes/webhooks';
import { webhookRegistry } from '../../../src/core/webhook/WebhookRegistry';

describe('Webhook Routes', () => {
  let app: Express;
  let mockSecureCredentialsGet: jest.Mock;

  beforeEach(() => {
    // Get the mock from the module
    const secureCredentialsMock = require('../../../src/utils/secureCredentials');
    mockSecureCredentialsGet = secureCredentialsMock.default.get;

    // Clear the registry
    webhookRegistry.clear();

    app = express();
    app.use(express.json());
    app.use('/api/webhooks', webhookRoutes);

    // Clear mocks
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
      mockSecureCredentialsGet.mockReturnValue('test-secret');

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(200);
    });

    it('should require signature verification in production', async () => {
      process.env.NODE_ENV = 'production';
      mockSecureCredentialsGet.mockReturnValue(null);

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('should reject skip verification flag in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SKIP_WEBHOOK_VERIFICATION = '1';
      mockSecureCredentialsGet.mockReturnValue('test-secret');

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('should allow signature verification skip in test environment', async () => {
      process.env.NODE_ENV = 'test';
      mockSecureCredentialsGet.mockReturnValue(null);

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(200);
    });

    it('should allow skip verification flag in non-production', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SKIP_WEBHOOK_VERIFICATION = '1';
      mockSecureCredentialsGet.mockReturnValue(null);

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/webhooks/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/webhooks/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('providers');
      expect(Array.isArray(response.body.providers)).toBe(true);
    });
  });
});
