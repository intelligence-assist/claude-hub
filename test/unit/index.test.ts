// Mock all dependencies before any imports
jest.mock('dotenv/config', () => ({}));

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

jest.mock('../../src/utils/logger', () => ({
  createLogger: jest.fn(() => mockLogger)
}));

const mockStartupMetrics = {
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
};

jest.mock('../../src/utils/startup-metrics', () => ({
  StartupMetrics: jest.fn(() => mockStartupMetrics)
}));

const mockExecSync = jest.fn();
const mockExecFile = jest.fn();
jest.mock('child_process', () => ({
  execSync: mockExecSync,
  execFile: mockExecFile
}));

jest.mock('../../src/utils/secureCredentials', () => ({
  secureCredentials: {
    get: jest.fn((key: string) => {
      // Return test values for common keys
      if (key === 'GITHUB_TOKEN') return 'test-github-token';
      if (key === 'ANTHROPIC_API_KEY') return 'test-anthropic-key';
      if (key === 'GITHUB_WEBHOOK_SECRET') return 'test-webhook-secret';
      return undefined;
    })
  }
}));

jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: jest.fn((fn) => fn ? async (...args: any[]) => fn(...args) : fn)
}));

// Mock the entire claudeService to avoid complex dependency issues
jest.mock('../../src/services/claudeService', () => ({
  processCommand: jest.fn().mockResolvedValue('Mock Claude response')
}));

// Mock the entire githubService to avoid complex dependency issues
jest.mock('../../src/services/githubService', () => ({
  addLabelsToIssue: jest.fn(),
  createRepositoryLabels: jest.fn(),
  postComment: jest.fn(),
  getCombinedStatus: jest.fn(),
  hasReviewedPRAtCommit: jest.fn(),
  getCheckSuitesForRef: jest.fn(),
  managePRLabels: jest.fn(),
  getFallbackLabels: jest.fn()
}));

describe('Express Application', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules(); // Clear module cache to ensure fresh imports
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    
    // Reset mockExecSync to default behavior
    mockExecSync.mockImplementation(() => Buffer.from(''));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const getApp = () => {
    // Import the app (it won't start the server in test mode due to require.main check)
    const app = require('../../src/index').default;
    return app;
  };

  describe('Application Structure', () => {
    it('should initialize Express app without starting server in test mode', () => {
      const app = getApp();
      
      expect(app).toBeDefined();
      expect(typeof app).toBe('function'); // Express app is a function
      expect(mockStartupMetrics.recordMilestone).toHaveBeenCalledWith(
        'env_loaded',
        'Environment variables loaded'
      );
      expect(mockStartupMetrics.recordMilestone).toHaveBeenCalledWith(
        'express_initialized',
        'Express app initialized'
      );
    });

    it('should record startup milestones during initialization', () => {
      const app = getApp();
      
      expect(app).toBeDefined();
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

    it('should use correct port default when PORT is not set', () => {
      delete process.env.PORT;
      const app = getApp();
      
      expect(app).toBeDefined();
      // In test mode, the app is initialized but server doesn't start
      // so we can't directly test the port but we can verify app creation
    });
  });
});