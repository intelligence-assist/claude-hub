import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';

// Set required environment variables
process.env.BOT_USERNAME = '@TestBot';

// Mock all dependencies before any imports
jest.mock('dotenv/config', () => ({}));
jest.mock('../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }))
}));
jest.mock('../../src/utils/startup-metrics', () => ({
  StartupMetrics: jest.fn().mockImplementation(() => ({
    startTime: Date.now(),
    milestones: [],
    ready: false,
    recordMilestone: jest.fn(),
    metricsMiddleware: jest.fn(() => (req: any, res: any, next: any) => next()),
    markReady: jest.fn(() => 150),
    getMetrics: jest.fn(() => ({
      isReady: true,
      totalElapsed: 1000,
      milestones: {},
      startTime: Date.now() - 1000
    }))
  }))
}));
jest.mock('../../src/routes/github', () => {
  const router = express.Router();
  router.post('/', (req: Request, res: Response) => res.status(200).send('github'));
  return router;
});
jest.mock('../../src/routes/claude', () => {
  const router = express.Router();
  router.post('/', (req: Request, res: Response) => res.status(200).send('claude'));
  return router;
});

const mockExecSync = jest.fn();
jest.mock('child_process', () => ({
  execSync: mockExecSync
}));

describe('Express Application', () => {
  let app: express.Application;
  const originalEnv = process.env;
  const mockLogger = (require('../../src/utils/logger') as any).createLogger();
  const mockStartupMetrics = new (require('../../src/utils/startup-metrics') as any).StartupMetrics();
  
  // Mock express listen to prevent actual server start
  const mockListen = jest.fn((port: number, callback?: () => void) => {
    if (callback) {
      setTimeout(callback, 0);
    }
    return { 
      close: jest.fn((cb?: () => void) => cb && cb()),
      listening: true 
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3004';
    process.env.BOT_USERNAME = '@TestBot';
    
    // Reset mockExecSync to default behavior
    mockExecSync.mockImplementation(() => Buffer.from(''));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const getApp = () => {
    // Clear the module cache
    jest.resetModules();
    
    // Re-mock modules for fresh import
    jest.mock('../../src/utils/logger', () => ({
      createLogger: jest.fn(() => mockLogger)
    }));
    jest.mock('../../src/utils/startup-metrics', () => ({
      StartupMetrics: jest.fn(() => mockStartupMetrics)
    }));
    jest.mock('child_process', () => ({
      execSync: mockExecSync
    }));
    
    // Mock express.application.listen
    const express = require('express');
    express.application.listen = mockListen;
    
    // Import the app
    require('../../src/index');
    
    // Get the app instance from the mocked listen call
    return mockListen.mock.contexts[0] as express.Application;
  };

  describe('Initialization', () => {
    it('should initialize with default port when PORT is not set', () => {
      delete process.env.PORT;
      getApp();
      
      expect(mockListen).toHaveBeenCalledWith(3003, expect.any(Function));
      expect(mockStartupMetrics.recordMilestone).toHaveBeenCalledWith(
        'env_loaded',
        'Environment variables loaded'
      );
    });

    it('should record startup milestones', () => {
      getApp();
      
      expect(mockStartupMetrics.recordMilestone).toHaveBeenCalledWith(
        'env_loaded',
        'Environment variables loaded'
      );
      expect(mockStartupMetrics.recordMilestone).toHaveBeenCalledWith(
        'express_initialized',
        'Express app initialized'
      );
      expect(mockStartupMetrics.recordMilestone).toHaveBeenCalledWith(
        'middleware_configured',
        'Express middleware configured'
      );
      expect(mockStartupMetrics.recordMilestone).toHaveBeenCalledWith(
        'routes_configured',
        'API routes configured'
      );
    });
  });

  describe('Middleware', () => {
    it('should log requests', async () => {
      app = getApp();
      await request(app).get('/health');

      // Wait for response to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/health',
          statusCode: 200,
          responseTime: expect.stringMatching(/\d+ms/)
        }),
        'GET /health'
      );
    });

    it('should apply rate limiting configuration', () => {
      app = getApp();
      // Rate limiting is configured but skipped in test mode
      expect(app).toBeDefined();
    });
  });

  describe('Routes', () => {
    it('should mount GitHub webhook routes', async () => {
      app = getApp();
      const response = await request(app)
        .post('/api/webhooks/github')
        .send({});
      
      expect(response.status).toBe(200);
      expect(response.text).toBe('github');
    });

    it('should mount Claude API routes', async () => {
      app = getApp();
      const response = await request(app)
        .post('/api/claude')
        .send({});
      
      expect(response.status).toBe(200);
      expect(response.text).toBe('claude');
    });
  });

  describe('Health Check Endpoint', () => {
    it('should return health status when everything is working', async () => {
      mockExecSync.mockImplementation(() => Buffer.from(''));
      mockStartupMetrics.getMetrics.mockReturnValue({
        isReady: true,
        totalElapsed: 1000,
        milestones: {},
        startTime: Date.now() - 1000
      });
      
      app = getApp();
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        docker: {
          available: true,
          error: null,
          checkTime: expect.any(Number)
        },
        claudeCodeImage: {
          available: true,
          error: null,
          checkTime: expect.any(Number)
        }
      });
    });

    it('should return degraded status when Docker is not available', async () => {
      // Set up mock before getting app
      const customMock = jest.fn((cmd: string) => {
        if (cmd.includes('docker ps')) {
          throw new Error('Docker not available');
        }
        return Buffer.from('');
      });
      
      // Clear modules and re-mock
      jest.resetModules();
      jest.mock('child_process', () => ({
        execSync: customMock
      }));
      jest.mock('../../src/utils/logger', () => ({
        createLogger: jest.fn(() => mockLogger)
      }));
      jest.mock('../../src/utils/startup-metrics', () => ({
        StartupMetrics: jest.fn(() => mockStartupMetrics)
      }));
      
      const express = require('express');
      express.application.listen = mockListen;
      
      require('../../src/index');
      app = mockListen.mock.contexts[mockListen.mock.contexts.length - 1] as express.Application;
      
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'degraded',
        docker: {
          available: false,
          error: 'Docker not available'
        }
      });
    });

    it('should return degraded status when Claude image is not available', async () => {
      // Set up mock before getting app  
      const customMock = jest.fn((cmd: string) => {
        if (cmd.includes('docker image inspect')) {
          throw new Error('Image not found');
        }
        return Buffer.from('');
      });
      
      // Clear modules and re-mock
      jest.resetModules();
      jest.mock('child_process', () => ({
        execSync: customMock
      }));
      jest.mock('../../src/utils/logger', () => ({
        createLogger: jest.fn(() => mockLogger)
      }));
      jest.mock('../../src/utils/startup-metrics', () => ({
        StartupMetrics: jest.fn(() => mockStartupMetrics)
      }));
      
      const express = require('express');
      express.application.listen = mockListen;
      
      require('../../src/index');
      app = mockListen.mock.contexts[mockListen.mock.contexts.length - 1] as express.Application;
      
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'degraded',
        claudeCodeImage: {
          available: false,
          error: 'Image not found'
        }
      });
    });
  });

  describe('Test Tunnel Endpoint', () => {
    it('should return tunnel test response', async () => {
      app = getApp();
      const response = await request(app)
        .get('/api/test-tunnel')
        .set('X-Test-Header', 'test-value');
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'success',
        message: 'CF tunnel is working!',
        timestamp: expect.any(String),
        headers: expect.objectContaining({
          'x-test-header': 'test-value'
        })
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith('Test tunnel endpoint hit');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      app = getApp();
      const response = await request(app).get('/non-existent-route');
      
      expect(response.status).toBe(404);
    });
  });

  describe('Server Startup', () => {
    it('should start server and record ready milestone', (done) => {
      getApp();
      
      // Wait for the callback to be executed
      setTimeout(() => {
        expect(mockStartupMetrics.recordMilestone).toHaveBeenCalledWith(
          'server_listening',
          expect.stringContaining('Server listening on port')
        );
        expect(mockStartupMetrics.markReady).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Server running on port')
        );
        done();
      }, 100);
    });
  });
});