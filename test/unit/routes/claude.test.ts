/* eslint-disable no-redeclare */
import request from 'supertest';
import express from 'express';

// Mock dependencies before imports
jest.mock('../../../src/services/claudeService');
jest.mock('../../../src/utils/logger');

const mockProcessCommand = jest.fn<() => Promise<string>>();
jest.mocked(require('../../../src/services/claudeService')).processCommand = mockProcessCommand;

interface MockLogger {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

const mockLogger: MockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
jest.mocked(require('../../../src/utils/logger')).createLogger = jest.fn(() => mockLogger);

// Import router after mocks are set up
import claudeRouter from '../../../src/routes/claude';

describe('Claude Routes', () => {
  let app: express.Application;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    app = express();
    app.use(express.json());
    app.use('/api/claude', claudeRouter);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST /api/claude', () => {
    it('should process valid Claude request with repository and command', async () => {
      mockProcessCommand.mockResolvedValue('Claude response');

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command'
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Command processed successfully',
        response: 'Claude response'
      });

      expect(mockProcessCommand).toHaveBeenCalledWith({
        repoFullName: 'owner/repo',
        issueNumber: null,
        command: 'Test command',
        isPullRequest: false,
        branchName: null
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ request: expect.any(Object) }),
        'Received direct Claude request'
      );
    });

    it('should handle repoFullName parameter as alternative to repository', async () => {
      mockProcessCommand.mockResolvedValue('Claude response');

      const response = await request(app).post('/api/claude').send({
        repoFullName: 'owner/repo',
        command: 'Test command'
      });

      expect(response.status).toBe(200);
      expect(mockProcessCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          repoFullName: 'owner/repo'
        })
      );
    });

    it('should process request with all optional parameters', async () => {
      mockProcessCommand.mockResolvedValue('Claude response');

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command',
        useContainer: true,
        issueNumber: 42,
        isPullRequest: true,
        branchName: 'feature-branch'
      });

      expect(response.status).toBe(200);
      expect(mockProcessCommand).toHaveBeenCalledWith({
        repoFullName: 'owner/repo',
        issueNumber: 42,
        command: 'Test command',
        isPullRequest: true,
        branchName: 'feature-branch'
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          repo: 'owner/repo',
          commandLength: 12,
          useContainer: true,
          issueNumber: 42,
          isPullRequest: true
        }),
        'Processing direct Claude command'
      );
    });

    it('should return 400 when repository is missing', async () => {
      const response = await request(app).post('/api/claude').send({
        command: 'Test command'
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Repository name is required'
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('Missing repository name in request');
      expect(mockProcessCommand).not.toHaveBeenCalled();
    });

    it('should return 400 when command is missing', async () => {
      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo'
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Command is required'
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('Missing command in request');
      expect(mockProcessCommand).not.toHaveBeenCalled();
    });

    it('should validate authentication when required', async () => {
      process.env.CLAUDE_API_AUTH_REQUIRED = '1';
      process.env.CLAUDE_API_AUTH_TOKEN = 'secret-token';

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command',
        authToken: 'wrong-token'
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Invalid authentication token'
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid authentication token');
      expect(mockProcessCommand).not.toHaveBeenCalled();
    });

    it('should accept valid authentication token', async () => {
      process.env.CLAUDE_API_AUTH_REQUIRED = '1';
      process.env.CLAUDE_API_AUTH_TOKEN = 'secret-token';
      mockProcessCommand.mockResolvedValue('Authenticated response');

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command',
        authToken: 'secret-token'
      });

      expect(response.status).toBe(200);
      expect(response.body.response).toBe('Authenticated response');
    });

    it('should skip authentication when not required', async () => {
      process.env.CLAUDE_API_AUTH_REQUIRED = '0';
      mockProcessCommand.mockResolvedValue('Response');

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command'
      });

      expect(response.status).toBe(200);
    });

    it('should handle empty Claude response with default message', async () => {
      mockProcessCommand.mockResolvedValue('');

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command'
      });

      expect(response.status).toBe(200);
      expect(response.body.response).toBe(
        'No output received from Claude container. This is a placeholder response.'
      );
    });

    it('should handle whitespace-only Claude response', async () => {
      mockProcessCommand.mockResolvedValue('   \n\t  ');

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command'
      });

      expect(response.status).toBe(200);
      expect(response.body.response).toBe(
        'No output received from Claude container. This is a placeholder response.'
      );
    });

    it('should handle Claude processing errors gracefully', async () => {
      const error = new Error('Claude processing failed');
      mockProcessCommand.mockRejectedValue(error);

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command'
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Command processed successfully',
        response: 'Error: Claude processing failed'
      });

      expect(mockLogger.error).toHaveBeenCalledWith({ error }, 'Error during Claude processing');
    });

    it('should handle unexpected errors', async () => {
      mockProcessCommand.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command'
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to process command',
        message: 'Unexpected error'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: {
            message: 'Unexpected error',
            stack: expect.any(String)
          }
        }),
        'Error processing direct Claude command'
      );
    });

    it('should log debug information about Claude response', async () => {
      mockProcessCommand.mockResolvedValue('Test response content');

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command'
      });

      expect(response.status).toBe(200);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        {
          responseType: 'string',
          responseLength: 20
        },
        'Raw Claude response received'
      );
    });

    it('should log successful completion', async () => {
      mockProcessCommand.mockResolvedValue('Response');

      const response = await request(app).post('/api/claude').send({
        repository: 'owner/repo',
        command: 'Test command'
      });

      expect(response.status).toBe(200);
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          responseLength: 8
        },
        'Successfully processed Claude command'
      );
    });
  });
});
