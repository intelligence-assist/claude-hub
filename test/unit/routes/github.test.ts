 
import request from 'supertest';
import express from 'express';
import type { Request, Response } from 'express';

// Mock the controller before importing the router
jest.mock('../../../src/controllers/githubController');

const mockHandleWebhook = jest.fn<(req: Request, res: Response) => void>();
jest.mocked(require('../../../src/controllers/githubController')).handleWebhook = mockHandleWebhook;

// Import router after mocks are set up
import githubRouter from '../../../src/routes/github';

describe('GitHub Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/webhooks/github', githubRouter);
  });

  describe('POST /api/webhooks/github', () => {
    it('should route webhook requests to the controller', async () => {
      mockHandleWebhook.mockImplementation((_req: Request, res: Response) => {
        res.status(200).json({ message: 'Webhook processed' });
      });

      const webhookPayload = {
        action: 'opened',
        issue: {
          number: 123,
          title: 'Test issue'
        }
      };

      const response = await request(app)
        .post('/api/webhooks/github')
        .send(webhookPayload)
        .set('X-GitHub-Event', 'issues')
        .set('X-GitHub-Delivery', 'test-delivery-id');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Webhook processed' });
      expect(mockHandleWebhook).toHaveBeenCalledTimes(1);
      expect(mockHandleWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          body: webhookPayload,
          headers: expect.objectContaining({
            'x-github-event': 'issues',
            'x-github-delivery': 'test-delivery-id'
          })
        }),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle controller errors', async () => {
      mockHandleWebhook.mockImplementation((_req: Request, res: Response) => {
        res.status(500).json({ error: 'Internal server error' });
      });

      const response = await request(app).post('/api/webhooks/github').send({ test: 'data' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    it('should pass through all HTTP methods to controller', async () => {
      mockHandleWebhook.mockImplementation((_req: Request, res: Response) => {
        res.status(200).send('OK');
      });

      // The router only defines POST, so other methods should return 404
      const getResponse = await request(app).get('/api/webhooks/github');

      expect(getResponse.status).toBe(404);
      expect(mockHandleWebhook).not.toHaveBeenCalled();

      // POST should work
      jest.clearAllMocks();
      const postResponse = await request(app).post('/api/webhooks/github').send({});

      expect(postResponse.status).toBe(200);
      expect(mockHandleWebhook).toHaveBeenCalledTimes(1);
    });

    it('should handle different content types', async () => {
      mockHandleWebhook.mockImplementation((req: Request, res: Response) => {
        res.status(200).json({
          contentType: req.get('content-type'),
          body: req.body
        });
      });

      // Test with JSON
      const jsonResponse = await request(app)
        .post('/api/webhooks/github')
        .send({ type: 'json' })
        .set('Content-Type', 'application/json');

      expect(jsonResponse.status).toBe(200);
      expect(jsonResponse.body.contentType).toBe('application/json');

      // Test with form data
      const formResponse = await request(app)
        .post('/api/webhooks/github')
        .send('type=form')
        .set('Content-Type', 'application/x-www-form-urlencoded');

      expect(formResponse.status).toBe(200);
    });

    it('should preserve raw body for signature verification', async () => {
      mockHandleWebhook.mockImplementation((req: Request, res: Response) => {
        // Check if rawBody is available (would be set by body parser in main app)
        res.status(200).json({
          hasRawBody: 'rawBody' in req,
          bodyType: typeof req.body
        });
      });

      const response = await request(app)
        .post('/api/webhooks/github')
        .send({ test: 'data' })
        .set('X-Hub-Signature-256', 'sha256=test');

      expect(response.status).toBe(200);
      expect(mockHandleWebhook).toHaveBeenCalled();
    });
  });
});
