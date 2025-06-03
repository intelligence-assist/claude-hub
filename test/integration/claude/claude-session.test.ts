import request from 'supertest';
import express from 'express';

// Mock child_process to prevent Docker commands
jest.mock('child_process', () => ({
  execSync: jest.fn(() => ''),
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, callback) => {
      if (event === 'close') {
        setTimeout(() => callback(0), 100);
      }
    })
  }))
}));

// Now we can import the routes
import webhookRoutes from '../../../src/routes/webhooks';

// Mock environment variables
process.env.CLAUDE_WEBHOOK_SECRET = 'test-secret';
process.env.SKIP_WEBHOOK_VERIFICATION = '1';

describe('Claude Session Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    // Import provider to register handlers
    require('../../../src/providers/claude');
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/webhooks', webhookRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/webhooks/claude - Session Management', () => {
    it('should create a new session', async () => {
      const payload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              repository: 'owner/repo',
              requirements: 'Test requirements'
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.session).toMatchObject({
        type: 'implementation',
        status: 'initializing',
        project: {
          repository: 'owner/repo',
          requirements: 'Test requirements'
        }
      });
      expect(response.body.data.session.id).toBeDefined();
      expect(response.body.data.session.containerId).toBeDefined();
    });

    it('should create session with custom type', async () => {
      const payload = {
        data: {
          type: 'session.create',
          session: {
            type: 'analysis',
            project: {
              repository: 'owner/repo',
              requirements: 'Test requirements'
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.session.type).toBe('analysis');
    });

    it('should reject session creation without repository', async () => {
      const payload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              requirements: 'Test requirements'
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Repository is required for session creation');
    });

    it('should reject session creation without requirements', async () => {
      const payload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              repository: 'owner/repo'
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Requirements are required for session creation');
    });

    it('should handle session.get request', async () => {
      // First create a session
      const createPayload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              repository: 'owner/repo',
              requirements: 'Test requirements'
            }
          }
        }
      };

      const createResponse = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(createPayload);

      const sessionId = createResponse.body.data.session.id;

      // Then get the session
      const getPayload = {
        data: {
          type: 'session.get',
          sessionId
        }
      };

      const getResponse = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(getPayload);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.session.id).toBe(sessionId);
    });

    it('should handle session.list request', async () => {
      const payload = {
        data: {
          type: 'session.list'
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions).toBeDefined();
      expect(Array.isArray(response.body.data.sessions)).toBe(true);
    });

    it('should handle session.start request', async () => {
      // Create a session first
      const createPayload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              repository: 'owner/repo',
              requirements: 'Test requirements'
            }
          }
        }
      };

      const createResponse = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(createPayload);

      const sessionId = createResponse.body.data.session.id;

      // Start the session
      const startPayload = {
        data: {
          type: 'session.start',
          sessionId
        }
      };

      const startResponse = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(startPayload);

      expect(startResponse.status).toBe(200);
      expect(startResponse.body.success).toBe(true);
      expect(startResponse.body.message).toBe('Session started');
    });

    it('should handle session.output request', async () => {
      // Create a session first
      const createPayload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              repository: 'owner/repo',
              requirements: 'Test requirements'
            }
          }
        }
      };

      const createResponse = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(createPayload);

      const sessionId = createResponse.body.data.session.id;

      // Get session output
      const outputPayload = {
        data: {
          type: 'session.output',
          sessionId
        }
      };

      const outputResponse = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(outputPayload);

      expect(outputResponse.status).toBe(200);
      expect(outputResponse.body.success).toBe(true);
      expect(outputResponse.body.data.sessionId).toBe(sessionId);
      expect(outputResponse.body.data.output).toBeNull(); // No output yet
    });

    it('should reject requests without authentication', async () => {
      const payload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              repository: 'owner/repo',
              requirements: 'Test'
            }
          }
        }
      };

      const response = await request(app).post('/api/webhooks/claude').send(payload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid authentication', async () => {
      const payload = {
        data: {
          type: 'session.create',
          session: {
            project: {
              repository: 'owner/repo',
              requirements: 'Test'
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer wrong-secret')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('POST /api/webhooks/claude - Orchestration', () => {
    it('should create orchestration session', async () => {
      const payload = {
        data: {
          type: 'orchestrate',
          project: {
            repository: 'owner/repo',
            requirements: 'Build a complete e-commerce platform'
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Orchestration session created');
      expect(response.body.data).toMatchObject({
        status: 'initiated',
        summary: 'Created orchestration session for owner/repo'
      });
      expect(response.body.data.orchestrationId).toBeDefined();
      expect(response.body.data.sessions).toHaveLength(1);
      expect(response.body.data.sessions[0].type).toBe('coordination');
    });

    it('should create orchestration session without auto-start', async () => {
      const payload = {
        data: {
          type: 'orchestrate',
          autoStart: false,
          project: {
            repository: 'owner/repo',
            requirements: 'Analyze and plan implementation'
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/claude')
        .set('Authorization', 'Bearer test-secret')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions[0].status).toBe('initializing');
    });
  });
});
