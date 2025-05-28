import express from 'express';
import request from 'supertest';

// Mock dependencies first
jest.mock('../../../src/services/claudeService', () => ({
  processCommand: jest.fn().mockResolvedValue('Mock response')
}));

jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('Claude Routes - Simple Coverage', () => {
  let app: express.Application;
  const mockProcessCommand = require('../../../src/services/claudeService').processCommand;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.BOT_USERNAME = '@TestBot'; // Required by claudeService
    app = express();
    app.use(express.json());

    // Import the router fresh
    jest.isolateModules(() => {
      const claudeRouter = require('../../../src/routes/claude').default;
      app.use('/api/claude', claudeRouter);
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should handle a basic request', async () => {
    const response = await request(app).post('/api/claude').send({
      repository: 'test/repo',
      command: 'test command'
    });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Command processed successfully');
  });

  it('should handle missing repository', async () => {
    const response = await request(app).post('/api/claude').send({
      command: 'test command'
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Repository name is required');
  });

  it('should handle missing command', async () => {
    const response = await request(app).post('/api/claude').send({
      repository: 'test/repo'
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Command is required');
  });

  it('should validate authentication when required', async () => {
    process.env.CLAUDE_API_AUTH_REQUIRED = '1';
    process.env.CLAUDE_API_AUTH_TOKEN = 'secret-token';

    const response = await request(app).post('/api/claude').send({
      repository: 'test/repo',
      command: 'test command'
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid authentication token');
  });

  it('should accept valid authentication', async () => {
    process.env.CLAUDE_API_AUTH_REQUIRED = '1';
    process.env.CLAUDE_API_AUTH_TOKEN = 'secret-token';

    const response = await request(app).post('/api/claude').send({
      repository: 'test/repo',
      command: 'test command',
      authToken: 'secret-token'
    });

    expect(response.status).toBe(200);
  });

  it('should handle empty response from Claude', async () => {
    mockProcessCommand.mockResolvedValueOnce('');

    const response = await request(app).post('/api/claude').send({
      repository: 'test/repo',
      command: 'test command'
    });

    expect(response.status).toBe(200);
    expect(response.body.response).toBe(
      'No output received from Claude container. This is a placeholder response.'
    );
  });

  it('should handle Claude processing error', async () => {
    mockProcessCommand.mockRejectedValueOnce(new Error('Processing failed'));

    const response = await request(app).post('/api/claude').send({
      repository: 'test/repo',
      command: 'test command'
    });

    expect(response.status).toBe(200);
    expect(response.body.response).toBe('Error: Processing failed');
  });

  it('should handle unexpected errors', async () => {
    mockProcessCommand.mockImplementationOnce(() => {
      throw new Error('Unexpected error');
    });

    const response = await request(app).post('/api/claude').send({
      repository: 'test/repo',
      command: 'test command'
    });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to process command');
    expect(response.body.message).toBe('Unexpected error');
  });
});
