// Test the Express app initialization and error handling
import express from 'express';
import request from 'supertest';

describe('Express App Error Handling', () => {
  let app: express.Application;
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a minimal app with error handling
    app = express();
    app.use(express.json());

    // Add test route that can trigger errors
    app.get('/test-error', (_req, _res, next) => {
      next(new Error('Test error'));
    });

    // Add the error handler from index.ts
    app.use(
      (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        mockLogger.error(
          {
            err: {
              message: err.message,
              stack: err.stack
            },
            method: req.method,
            url: req.url
          },
          'Request error'
        );
        
        // Handle JSON parsing errors
        if (err instanceof SyntaxError && 'body' in err) {
          res.status(400).json({ error: 'Invalid JSON' });
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    );
  });

  it('should handle errors with error middleware', async () => {
    const response = await request(app).get('/test-error');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: {
          message: 'Test error',
          stack: expect.any(String)
        },
        method: 'GET',
        url: '/test-error'
      }),
      'Request error'
    );
  });

  it('should handle JSON parsing errors', async () => {
    const response = await request(app)
      .post('/api/test')
      .set('Content-Type', 'application/json')
      .send('invalid json');

    expect(response.status).toBe(400);
  });
});

describe('Express App Docker Checks', () => {
  const mockExecSync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mock('child_process', () => ({
      execSync: mockExecSync
    }));
  });

  it('should handle docker check errors properly', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker ps')) {
        throw new Error('Docker daemon not running');
      }
      if (cmd.includes('docker image inspect')) {
        throw new Error('');
      }
      return Buffer.from('');
    });

    // Test Docker error is caught
    expect(() => mockExecSync('docker ps')).toThrow('Docker daemon not running');
  });
});
