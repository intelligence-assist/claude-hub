const express = require('express');
const request = require('supertest');

// Mock the controller
jest.mock('../../../src/controllers/chatbotController', () => ({
  handleChatbotWebhook: jest.fn((req, res) => {
    res.status(200).json({ success: true });
  }),
  handleDiscordWebhook: jest.fn((req, res) => {
    res.status(200).json({ provider: 'discord' });
  }),
  getProviderStats: jest.fn((req, res) => {
    res.status(200).json({ stats: {} });
  })
}));

describe('Chatbot Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());

    // Import the router fresh
    const chatbotRouter = require('../../../src/routes/chatbot');
    app.use('/webhooks', chatbotRouter);
  });

  it('should handle Discord webhook', async () => {
    const response = await request(app).post('/webhooks/discord').send({ type: 1 });

    expect(response.status).toBe(200);
    expect(response.body.provider).toBe('discord');
  });

  it('should get provider stats', async () => {
    const response = await request(app).get('/webhooks/stats');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('stats');
  });
});
