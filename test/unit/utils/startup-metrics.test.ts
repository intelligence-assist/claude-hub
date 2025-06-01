import type { Request, Response, NextFunction } from 'express';

// Mock the logger
jest.mock('../../../src/utils/logger');

interface MockLogger {
  info: jest.Mock;
  error: jest.Mock;
  warn: jest.Mock;
  debug: jest.Mock;
}

const mockLogger: MockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

jest.mocked(require('../../../src/utils/logger')).createLogger = jest.fn(() => mockLogger);

// Import after mocks are set up
import { StartupMetrics } from '../../../src/utils/startup-metrics';

describe('StartupMetrics', () => {
  let metrics: StartupMetrics;
  let mockDateNow: jest.SpiedFunction<typeof Date.now>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Date.now for consistent timing
    mockDateNow = jest.spyOn(Date, 'now');
    mockDateNow.mockReturnValue(1000);

    metrics = new StartupMetrics();

    // Advance time for subsequent calls
    let currentTime = 1000;
    mockDateNow.mockImplementation(() => {
      currentTime += 100;
      return currentTime;
    });
  });

  afterEach(() => {
    mockDateNow.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with current timestamp', () => {
      mockDateNow.mockReturnValue(5000);
      const newMetrics = new StartupMetrics();

      expect(newMetrics.startTime).toBe(5000);
      expect(newMetrics.milestones).toEqual([]);
      expect(newMetrics.ready).toBe(false);
      expect(newMetrics.totalStartupTime).toBeUndefined();
    });
  });

  describe('recordMilestone', () => {
    it('should record a milestone with description', () => {
      metrics.recordMilestone('test_milestone', 'Test milestone description');

      expect(metrics.milestones).toHaveLength(1);
      expect(metrics.milestones[0]).toEqual({
        name: 'test_milestone',
        timestamp: 1100,
        description: 'Test milestone description'
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          milestone: 'test_milestone',
          elapsed: '100ms',
          description: 'Test milestone description'
        },
        'Startup milestone: test_milestone'
      );
    });

    it('should record a milestone without description', () => {
      metrics.recordMilestone('test_milestone');

      expect(metrics.milestones[0]).toEqual({
        name: 'test_milestone',
        timestamp: 1100,
        description: ''
      });
    });

    it('should track multiple milestones', () => {
      metrics.recordMilestone('first', 'First milestone');
      metrics.recordMilestone('second', 'Second milestone');
      metrics.recordMilestone('third', 'Third milestone');

      expect(metrics.milestones).toHaveLength(3);
      expect(metrics.getMilestoneNames()).toEqual(['first', 'second', 'third']);
    });

    it('should calculate elapsed time correctly', () => {
      // Reset to have predictable times
      mockDateNow.mockReturnValueOnce(2000);
      const newMetrics = new StartupMetrics();

      mockDateNow.mockReturnValueOnce(2500);
      newMetrics.recordMilestone('milestone1');

      mockDateNow.mockReturnValueOnce(3000);
      newMetrics.recordMilestone('milestone2');

      const milestone1 = newMetrics.getMilestone('milestone1');
      const milestone2 = newMetrics.getMilestone('milestone2');

      expect(milestone1?.elapsed).toBe(500);
      expect(milestone2?.elapsed).toBe(1000);
    });
  });

  describe('markReady', () => {
    it('should mark service as ready and record total startup time', () => {
      mockDateNow.mockReturnValueOnce(2000);
      const totalTime = metrics.markReady();

      expect(metrics.ready).toBe(true);
      expect(metrics.totalStartupTime).toBe(1000);
      expect(totalTime).toBe(1000);

      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          totalStartupTime: '1000ms',
          milestones: expect.any(Object)
        },
        'Service startup completed'
      );

      // Should have recorded service_ready milestone
      const readyMilestone = metrics.getMilestone('service_ready');
      expect(readyMilestone).toBeDefined();
      expect(readyMilestone?.description).toBe('Service is ready to accept requests');
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics state', () => {
      metrics.recordMilestone('test1', 'Test 1');
      metrics.recordMilestone('test2', 'Test 2');

      const metricsData = metrics.getMetrics();

      expect(metricsData).toEqual({
        isReady: false,
        totalElapsed: expect.any(Number),
        milestones: {
          test1: {
            timestamp: expect.any(Number),
            elapsed: expect.any(Number),
            description: 'Test 1'
          },
          test2: {
            timestamp: expect.any(Number),
            elapsed: expect.any(Number),
            description: 'Test 2'
          }
        },
        startTime: 1000,
        totalStartupTime: undefined
      });
    });

    it('should include totalStartupTime when ready', () => {
      metrics.markReady();
      const metricsData = metrics.getMetrics();

      expect(metricsData.isReady).toBe(true);
      expect(metricsData.totalStartupTime).toBeDefined();
    });
  });

  describe('metricsMiddleware', () => {
    it('should attach metrics to request object', () => {
      const middleware = metrics.metricsMiddleware();
      const req = {} as Request & { startupMetrics?: any };
      const res = {} as Response;
      const next = jest.fn() as NextFunction;

      metrics.recordMilestone('before_middleware');

      middleware(req, res, next);

      expect(req.startupMetrics).toBeDefined();
      expect(req.startupMetrics.milestones).toHaveProperty('before_middleware');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should call next without error', () => {
      const middleware = metrics.metricsMiddleware();
      const req = {} as Request;
      const res = {} as Response;
      const next = jest.fn() as NextFunction;

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('getMilestone', () => {
    it('should return milestone data if exists', () => {
      metrics.recordMilestone('test_milestone', 'Test');

      const milestone = metrics.getMilestone('test_milestone');

      expect(milestone).toEqual({
        timestamp: expect.any(Number),
        elapsed: expect.any(Number),
        description: 'Test'
      });
    });

    it('should return undefined for non-existent milestone', () => {
      const milestone = metrics.getMilestone('non_existent');

      expect(milestone).toBeUndefined();
    });
  });

  describe('getMilestoneNames', () => {
    it('should return empty array when no milestones', () => {
      expect(metrics.getMilestoneNames()).toEqual([]);
    });

    it('should return all milestone names', () => {
      metrics.recordMilestone('first');
      metrics.recordMilestone('second');
      metrics.recordMilestone('third');

      expect(metrics.getMilestoneNames()).toEqual(['first', 'second', 'third']);
    });
  });

  describe('getElapsedTime', () => {
    it('should return elapsed time since start', () => {
      mockDateNow.mockReturnValueOnce(5000);

      const elapsed = metrics.getElapsedTime();

      expect(elapsed).toBe(4000); // 5000 - 1000 (start time)
    });
  });

  describe('isServiceReady', () => {
    it('should return false initially', () => {
      expect(metrics.isServiceReady()).toBe(false);
    });

    it('should return true after markReady', () => {
      metrics.markReady();
      expect(metrics.isServiceReady()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      metrics.recordMilestone('test1');
      metrics.recordMilestone('test2');
      metrics.markReady();

      metrics.reset();

      expect(metrics.milestones).toEqual([]);
      expect(metrics.getMilestoneNames()).toEqual([]);
      expect(metrics.ready).toBe(false);
      expect(metrics.totalStartupTime).toBeUndefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Startup metrics reset');
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical startup sequence', () => {
      // Simulate typical app startup
      metrics.recordMilestone('env_loaded', 'Environment variables loaded');
      metrics.recordMilestone('express_initialized', 'Express app initialized');
      metrics.recordMilestone('middleware_configured', 'Middleware configured');
      metrics.recordMilestone('routes_configured', 'Routes configured');
      metrics.recordMilestone('server_listening', 'Server listening on port 3000');

      const totalTime = metrics.markReady();

      expect(metrics.getMilestoneNames()).toEqual([
        'env_loaded',
        'express_initialized',
        'middleware_configured',
        'routes_configured',
        'server_listening',
        'service_ready'
      ]);

      expect(totalTime).toBeGreaterThan(0);
      expect(metrics.isServiceReady()).toBe(true);
    });

    it('should provide accurate metrics through middleware', () => {
      const middleware = metrics.metricsMiddleware();

      // Record some milestones
      metrics.recordMilestone('startup', 'Application started');

      // Simulate request
      const req = {} as Request & { startupMetrics?: any };
      const res = {} as Response;
      const next = jest.fn() as NextFunction;

      middleware(req, res, next);

      // Verify metrics are attached
      expect(req.startupMetrics).toMatchObject({
        isReady: false,
        totalElapsed: expect.any(Number),
        milestones: {
          startup: expect.objectContaining({
            description: 'Application started'
          })
        }
      });

      // Mark ready
      metrics.markReady();

      // Another request should show ready state
      const req2 = {} as Request & { startupMetrics?: any };
      middleware(req2, res, next);

      expect(req2.startupMetrics.isReady).toBe(true);
      expect(req2.startupMetrics.totalStartupTime).toBeDefined();
    });
  });
});
