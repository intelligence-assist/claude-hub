import express from 'express';
import request from 'supertest';

// Mock the controller
jest.mock('../../../src/controllers/githubController', () => ({
  handleWebhook: jest.fn((req: any, res: any) => {
    res.status(200).json({ success: true });
  })
}));

describe('GitHub Routes - Simple Coverage', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());

    // Import the router fresh
    jest.isolateModules(() => {
      const githubRouter = require('../../../src/routes/github').default;
      app.use('/github', githubRouter);
    });
  });

  it('should handle webhook POST request', async () => {
    const response = await request(app).post('/github').send({ test: 'data' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
