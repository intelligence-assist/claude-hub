const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const chatbotRoutes = require('../../../src/routes/chatbot');

// Mock dependencies
jest.mock('../../../src/controllers/chatbotController', () => ({
  handleDiscordWebhook: jest.fn(),
  handleSlackWebhook: jest.fn(),
  handleNextcloudWebhook: jest.fn(),
  getProviderStats: jest.fn()
}));

const chatbotController = require('../../../src/controllers/chatbotController');

describe('Chatbot Integration Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    
    // Middleware to capture raw body for signature verification
    app.use(bodyParser.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    
    // Mount chatbot routes
    app.use('/api/webhooks/chatbot', chatbotRoutes);

    jest.clearAllMocks();
  });

  describe('Discord webhook endpoint', () => {
    it('should route to Discord webhook handler', async () => {
      chatbotController.handleDiscordWebhook.mockImplementation((req, res) => {
        res.status(200).json({ success: true });
      });

      const discordPayload = {
        type: 1 // PING
      };

      const response = await request(app)
        .post('/api/webhooks/chatbot/discord')
        .send(discordPayload)
        .expect(200);

      expect(chatbotController.handleDiscordWebhook).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual({ success: true });
    });

    it('should handle Discord slash command webhook', async () => {
      chatbotController.handleDiscordWebhook.mockImplementation((req, res) => {
        res.status(200).json({ 
          success: true,
          message: 'Command processed successfully',
          context: {
            provider: 'discord',
            userId: 'user123'
          }
        });
      });

      const slashCommandPayload = {
        type: 2, // APPLICATION_COMMAND
        data: {
          name: 'claude',
          options: [
            {
              name: 'command',
              value: 'help me with this code'
            }
          ]
        },
        channel_id: '123456789',
        member: {
          user: {
            id: 'user123',
            username: 'testuser'
          }
        },
        token: 'interaction_token',
        id: 'interaction_id'
      };

      const response = await request(app)
        .post('/api/webhooks/chatbot/discord')
        .set('x-signature-ed25519', 'mock_signature')
        .set('x-signature-timestamp', '1234567890')
        .send(slashCommandPayload)
        .expect(200);

      expect(chatbotController.handleDiscordWebhook).toHaveBeenCalledTimes(1);
      expect(response.body.success).toBe(true);
    });

    it('should handle Discord component interaction webhook', async () => {
      chatbotController.handleDiscordWebhook.mockImplementation((req, res) => {
        res.status(200).json({ success: true });
      });

      const componentPayload = {
        type: 3, // MESSAGE_COMPONENT
        data: {
          custom_id: 'help_button'
        },
        channel_id: '123456789',
        user: {
          id: 'user123',
          username: 'testuser'
        },
        token: 'interaction_token',
        id: 'interaction_id'
      };

      await request(app)
        .post('/api/webhooks/chatbot/discord')
        .send(componentPayload)
        .expect(200);

      expect(chatbotController.handleDiscordWebhook).toHaveBeenCalledTimes(1);
    });

    it('should pass raw body for signature verification', async () => {
      chatbotController.handleDiscordWebhook.mockImplementation((req, res) => {
        // Verify that req.rawBody is available
        expect(req.rawBody).toBeInstanceOf(Buffer);
        res.status(200).json({ success: true });
      });

      await request(app)
        .post('/api/webhooks/chatbot/discord')
        .send({ type: 1 });

      expect(chatbotController.handleDiscordWebhook).toHaveBeenCalledTimes(1);
    });
  });

  describe('Slack webhook endpoint', () => {
    it('should route to Slack webhook handler', async () => {
      chatbotController.handleSlackWebhook.mockImplementation((req, res) => {
        res.status(200).json({ success: true });
      });

      const slackPayload = {
        type: 'url_verification',
        challenge: 'test_challenge'
      };

      const response = await request(app)
        .post('/api/webhooks/chatbot/slack')
        .send(slackPayload)
        .expect(200);

      expect(chatbotController.handleSlackWebhook).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual({ success: true });
    });

    it('should handle Slack slash command webhook', async () => {
      chatbotController.handleSlackWebhook.mockImplementation((req, res) => {
        res.status(200).json({ 
          success: true,
          message: 'Command processed successfully'
        });
      });

      const slashCommandPayload = {
        type: 'slash_commands',
        command: '/claude',
        text: 'help me debug this function',
        user_id: 'U1234567',
        user_name: 'testuser',
        channel_id: 'C1234567',
        team_id: 'T1234567'
      };

      await request(app)
        .post('/api/webhooks/chatbot/slack')
        .send(slashCommandPayload)
        .expect(200);

      expect(chatbotController.handleSlackWebhook).toHaveBeenCalledTimes(1);
    });
  });

  describe('Nextcloud webhook endpoint', () => {
    it('should route to Nextcloud webhook handler', async () => {
      chatbotController.handleNextcloudWebhook.mockImplementation((req, res) => {
        res.status(200).json({ success: true });
      });

      const nextcloudPayload = {
        type: 'chat_message',
        message: '@claude help me with this file',
        user: 'testuser',
        conversation: 'general'
      };

      const response = await request(app)
        .post('/api/webhooks/chatbot/nextcloud')
        .send(nextcloudPayload)
        .expect(200);

      expect(chatbotController.handleNextcloudWebhook).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual({ success: true });
    });
  });

  describe('Provider stats endpoint', () => {
    it('should return provider statistics', async () => {
      chatbotController.getProviderStats.mockImplementation((req, res) => {
        res.json({
          success: true,
          stats: {
            totalRegistered: 3,
            totalInitialized: 1,
            availableProviders: ['discord', 'slack', 'nextcloud'],
            initializedProviders: ['discord']
          },
          providers: {
            discord: {
              name: 'DiscordProvider',
              initialized: true,
              botMention: '@claude'
            }
          },
          timestamp: '2024-01-01T00:00:00.000Z'
        });
      });

      const response = await request(app)
        .get('/api/webhooks/chatbot/stats')
        .expect(200);

      expect(chatbotController.getProviderStats).toHaveBeenCalledTimes(1);
      expect(response.body.success).toBe(true);
      expect(response.body.stats).toBeDefined();
      expect(response.body.providers).toBeDefined();
    });

    it('should handle stats endpoint errors', async () => {
      chatbotController.getProviderStats.mockImplementation((req, res) => {
        res.status(500).json({
          error: 'Failed to get provider statistics',
          message: 'Stats service unavailable'
        });
      });

      const response = await request(app)
        .get('/api/webhooks/chatbot/stats')
        .expect(500);

      expect(response.body.error).toBe('Failed to get provider statistics');
    });
  });

  describe('Error handling', () => {
    it('should handle Discord webhook controller errors', async () => {
      chatbotController.handleDiscordWebhook.mockImplementation((req, res) => {
        res.status(500).json({
          error: 'Internal server error',
          errorReference: 'err-12345',
          timestamp: '2024-01-01T00:00:00.000Z',
          provider: 'discord'
        });
      });

      const response = await request(app)
        .post('/api/webhooks/chatbot/discord')
        .send({ type: 1 })
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
      expect(response.body.errorReference).toBeDefined();
      expect(response.body.provider).toBe('discord');
    });

    it('should handle Slack webhook controller errors', async () => {
      chatbotController.handleSlackWebhook.mockImplementation((req, res) => {
        res.status(401).json({
          error: 'Invalid webhook signature'
        });
      });

      await request(app)
        .post('/api/webhooks/chatbot/slack')
        .send({ test: 'payload' })
        .expect(401);
    });

    it('should handle invalid JSON payloads', async () => {
      // This test ensures that malformed JSON is handled by Express
      const response = await request(app)
        .post('/api/webhooks/chatbot/discord')
        .set('Content-Type', 'application/json')
        .send('invalid json{')
        .expect(400);

      expect(response.body).toMatchObject({
        type: expect.any(String)
      });
    });

    it('should handle missing Content-Type', async () => {
      chatbotController.handleDiscordWebhook.mockImplementation((req, res) => {
        res.status(200).json({ success: true });
      });

      await request(app)
        .post('/api/webhooks/chatbot/discord')
        .send('plain text payload')
        .expect(200);
    });
  });

  describe('Request validation', () => {
    it('should accept valid Discord webhook requests', async () => {
      chatbotController.handleDiscordWebhook.mockImplementation((req, res) => {
        expect(req.body).toEqual({ type: 1 });
        expect(req.headers['content-type']).toContain('application/json');
        res.status(200).json({ type: 1 });
      });

      await request(app)
        .post('/api/webhooks/chatbot/discord')
        .set('Content-Type', 'application/json')
        .send({ type: 1 })
        .expect(200);
    });

    it('should handle large payloads gracefully', async () => {
      chatbotController.handleDiscordWebhook.mockImplementation((req, res) => {
        res.status(200).json({ success: true });
      });

      const largePayload = {
        type: 2,
        data: {
          name: 'claude',
          options: [{
            name: 'command',
            value: 'A'.repeat(2000) // Large command
          }]
        }
      };

      await request(app)
        .post('/api/webhooks/chatbot/discord')
        .send(largePayload)
        .expect(200);
    });
  });
});