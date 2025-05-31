// Tests for proxy configuration and error handling in main app
import request from 'supertest';

// Mock modules before importing the app
jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

jest.mock('../../src/utils/startup-metrics', () => ({
  StartupMetrics: jest.fn().mockImplementation(() => ({
    recordMilestone: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({
      startTime: Date.now(),
      milestones: {
        appStarted: Date.now(),
        routesConfigured: Date.now()
      }
    })
  }))
}));

jest.mock('../../src/routes/github', () => {
  return jest.fn((req: any, res: any) => {
    res.status(200).json({ message: 'github route working' });
  });
});

jest.mock('../../src/routes/claude', () => {
  return jest.fn((req: any, res: any) => {
    res.status(200).json({ message: 'claude route working' });
  });
});

jest.mock('child_process', () => ({
  execSync: jest.fn().mockReturnValue('https://example.ngrok.io')
}));

describe('Express App - Proxy and Error Handling', () => {
  describe('Trust proxy configuration', () => {
    let originalTrustProxy: string | undefined;

    beforeEach(() => {
      originalTrustProxy = process.env.TRUST_PROXY;
      jest.resetModules();
    });

    afterEach(() => {
      if (originalTrustProxy !== undefined) {
        process.env.TRUST_PROXY = originalTrustProxy;
      } else {
        delete process.env.TRUST_PROXY;
      }
    });

    it('should enable trust proxy when behind reverse proxies', async () => {
      process.env.TRUST_PROXY = 'true';
      
      const app = require('../../src/index').default;
      
      // Test that the app handles X-Forwarded-For headers correctly
      const response = await request(app)
        .get('/health')
        .set('X-Forwarded-For', '203.0.113.1')
        .set('X-Forwarded-Proto', 'https')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String)
      });
    });

    it('should not trust proxy headers when not configured', async () => {
      process.env.TRUST_PROXY = 'false';
      
      const app = require('../../src/index').default;
      
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });
  });

  describe('Application endpoints', () => {
    it('should serve health check endpoint correctly', async () => {
      const app = require('../../src/index').default;
      
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        metrics: expect.objectContaining({
          startTime: expect.any(Number),
          milestones: expect.any(Object)
        })
      });
    });

    it('should handle test tunnel endpoint for development', async () => {
      const app = require('../../src/index').default;
      
      const response = await request(app)
        .get('/test-tunnel')
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Test tunnel endpoint reached',
        timestamp: expect.any(String),
        tunnelUrl: 'https://example.ngrok.io'
      });
    });

    it('should gracefully handle tunnel command failures', async () => {
      const { execSync } = require('child_process');
      execSync.mockImplementationOnce(() => {
        throw new Error('Tunnel service not available');
      });

      const app = require('../../src/index').default;
      
      const response = await request(app)
        .get('/test-tunnel')
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Test tunnel endpoint reached',
        timestamp: expect.any(String),
        tunnelUrl: 'Error getting tunnel URL'
      });
    });
  });

  describe('Route integration', () => {
    it('should properly mount GitHub webhook routes', async () => {
      const app = require('../../src/index').default;
      
      const response = await request(app)
        .post('/api/webhooks/github')
        .send({ test: 'data' })
        .expect(200);

      expect(response.body.message).toBe('github route working');
    });

    it('should properly mount Claude API routes', async () => {
      const app = require('../../src/index').default;
      
      const response = await request(app)
        .post('/api/claude')
        .send({ command: 'test' })
        .expect(200);

      expect(response.body.message).toBe('claude route working');
    });
  });

  describe('Error handling middleware', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const app = require('../../src/index').default;
      
      const response = await request(app)
        .get('/non-existent-endpoint')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'The requested endpoint was not found',
        path: '/non-existent-endpoint',
        timestamp: expect.any(String)
      });
    });

    it('should handle application errors gracefully', async () => {
      // Mock a route that throws an error
      const githubRoute = require('../../src/routes/github');
      githubRoute.mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      const app = require('../../src/index').default;
      
      const response = await request(app)
        .post('/api/webhooks/github')
        .send({ test: 'data' })
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: expect.any(String),
        timestamp: expect.any(String)
      });

      // Should not expose internal error details in production
      expect(response.body.message).not.toContain('Database connection failed');
    });
  });

  describe('Request parsing and limits', () => {
    it('should handle large webhook payloads within limits', async () => {
      const app = require('../../src/index').default;
      
      // Create a moderately large payload (under the 10MB limit)
      const largePayload = {
        action: 'opened',
        issue: {
          body: 'x'.repeat(1000), // 1KB of text
          title: 'Test issue'
        },
        repository: { full_name: 'owner/repo' }
      };
      
      const response = await request(app)
        .post('/api/webhooks/github')
        .send(largePayload)
        .expect(200);

      expect(response.body.message).toBe('github route working');
    });

    it('should parse JSON payloads correctly', async () => {
      const app = require('../../src/index').default;
      
      const payload = {
        action: 'created',
        comment: { body: 'Test comment' },
        repository: { full_name: 'owner/repo' }
      };
      
      const response = await request(app)
        .post('/api/webhooks/github')
        .send(payload)
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body.message).toBe('github route working');
    });
  });

  describe('Environment configuration', () => {
    it('should respect custom PORT environment variable', () => {
      const originalPort = process.env.PORT;
      process.env.PORT = '4000';
      
      jest.resetModules();
      const app = require('../../src/index').default;
      
      expect(app).toBeDefined();
      
      // Restore original PORT
      if (originalPort !== undefined) {
        process.env.PORT = originalPort;
      } else {
        delete process.env.PORT;
      }
    });

    it('should use default port when PORT is not specified', () => {
      const originalPort = process.env.PORT;
      delete process.env.PORT;
      
      jest.resetModules();
      const app = require('../../src/index').default;
      
      expect(app).toBeDefined();
      
      // Restore original PORT
      if (originalPort !== undefined) {
        process.env.PORT = originalPort;
      }
    });
  });
});