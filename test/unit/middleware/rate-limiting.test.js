const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');

describe('Rate Limiting Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    
    // Configure rate limiter for testing (low limits)
    const testLimiter = rateLimit({
      windowMs: 1000, // 1 second for fast tests
      max: 3, // 3 requests per second
      message: 'Too many requests',
      standardHeaders: true,
      legacyHeaders: false
    });

    app.use(testLimiter);
    app.get('/test', (req, res) => {
      res.status(200).json({ message: 'success' });
    });
  });

  it('should allow requests within the rate limit', async () => {
    // First request should succeed
    const response1 = await request(app)
      .get('/test')
      .expect(200);

    expect(response1.body.message).toBe('success');
    expect(response1.headers['ratelimit-limit']).toBe('3');
    expect(response1.headers['ratelimit-remaining']).toBe('2');
  });

  it('should block requests that exceed the rate limit', async () => {
    // Make 3 requests (at the limit)
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);

    // 4th request should be rate limited
    const response = await request(app)
      .get('/test')
      .expect(429);

    expect(response.text).toContain('Too many requests');
    expect(response.headers['ratelimit-remaining']).toBe('0');
  });

  it('should reset rate limit after the window expires', async () => {
    // Exhaust the rate limit
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(429);

    // Wait for window to reset (1 second + buffer)
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should be able to make requests again
    await request(app).get('/test').expect(200);
  });

  it('should include proper rate limit headers', async () => {
    const response = await request(app)
      .get('/test')
      .expect(200);

    expect(response.headers).toHaveProperty('ratelimit-limit');
    expect(response.headers).toHaveProperty('ratelimit-remaining');
    expect(response.headers).toHaveProperty('ratelimit-reset');
    
    // Should not include legacy headers
    expect(response.headers).not.toHaveProperty('x-ratelimit-limit');
    expect(response.headers).not.toHaveProperty('x-ratelimit-remaining');
  });
});

describe('Webhook Rate Limiting Integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Simulate webhook rate limiter
    const webhookLimiter = rateLimit({
      windowMs: 1000, // 1 second
      max: 2, // 2 requests per second for testing
      message: 'Too many webhook requests',
      standardHeaders: true,
      legacyHeaders: false
    });

    app.use('/api/webhooks/github', webhookLimiter);
    app.post('/api/webhooks/github', (req, res) => {
      res.status(200).json({ received: true });
    });
  });

  it('should rate limit webhook endpoints specifically', async () => {
    // First two requests should succeed
    await request(app)
      .post('/api/webhooks/github')
      .send({ test: 'data' })
      .expect(200);

    await request(app)
      .post('/api/webhooks/github')
      .send({ test: 'data' })
      .expect(200);

    // Third request should be rate limited
    await request(app)
      .post('/api/webhooks/github')
      .send({ test: 'data' })
      .expect(429);
  });
});