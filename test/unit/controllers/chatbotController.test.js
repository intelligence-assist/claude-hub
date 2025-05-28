// Mock dependencies
jest.mock('../../../src/services/claudeService');
jest.mock('../../../src/providers/ProviderFactory');
jest.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

jest.mock('../../../src/utils/secureCredentials', () => ({
  get: jest.fn(),
  loadCredentials: jest.fn()
}));

// Set required environment variables for claudeService
process.env.BOT_USERNAME = 'testbot';
process.env.DEFAULT_AUTHORIZED_USER = 'testuser';

const chatbotController = require('../../../src/controllers/chatbotController');
const claudeService = require('../../../src/services/claudeService');
const providerFactory = require('../../../src/providers/ProviderFactory');
jest.mock('../../../src/utils/sanitize', () => ({
  sanitizeBotMentions: jest.fn(msg => msg)
}));

describe('chatbotController', () => {
  let req, res, mockProvider;

  beforeEach(() => {
    req = {
      method: 'POST',
      path: '/api/webhooks/chatbot/discord',
      headers: {
        'user-agent': 'Discord-Webhooks/1.0',
        'content-type': 'application/json'
      },
      body: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockProvider = {
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
      parseWebhookPayload: jest.fn(),
      extractBotCommand: jest.fn(),
      sendResponse: jest.fn().mockResolvedValue(),
      getUserId: jest.fn(),
      isUserAuthorized: jest.fn().mockReturnValue(true),
      formatErrorMessage: jest.fn().mockReturnValue('Error message'),
      getProviderName: jest.fn().mockReturnValue('DiscordProvider'),
      getBotMention: jest.fn().mockReturnValue('@claude')
    };

    providerFactory.getProvider.mockReturnValue(mockProvider);
    providerFactory.createFromEnvironment.mockResolvedValue(mockProvider);
    providerFactory.getStats.mockReturnValue({
      totalRegistered: 1,
      totalInitialized: 1,
      availableProviders: ['discord'],
      initializedProviders: ['discord']
    });
    providerFactory.getAllProviders.mockReturnValue(new Map([['discord', mockProvider]]));

    claudeService.processCommand.mockResolvedValue('Claude response');

    jest.clearAllMocks();
  });

  describe('handleChatbotWebhook', () => {
    it('should handle successful webhook with valid signature', async () => {
      mockProvider.parseWebhookPayload.mockReturnValue({
        type: 'command',
        content: 'help me',
        userId: 'user123',
        username: 'testuser',
        channelId: 'channel123'
      });
      mockProvider.extractBotCommand.mockReturnValue({
        command: 'help me',
        originalMessage: 'help me'
      });
      mockProvider.getUserId.mockReturnValue('user123');

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(mockProvider.verifyWebhookSignature).toHaveBeenCalledWith(req);
      expect(mockProvider.parseWebhookPayload).toHaveBeenCalledWith(req.body);
      expect(claudeService.processCommand).toHaveBeenCalledWith({
        repoFullName: null,
        issueNumber: null,
        command: 'help me',
        isPullRequest: false,
        branchName: null,
        chatbotContext: {
          provider: 'discord',
          userId: 'user123',
          username: 'testuser',
          channelId: 'channel123',
          guildId: undefined
        }
      });
      expect(mockProvider.sendResponse).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Command processed successfully'
      }));
    });

    it('should return 401 for invalid webhook signature', async () => {
      mockProvider.verifyWebhookSignature.mockReturnValue(false);

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid webhook signature'
      });
      expect(claudeService.processCommand).not.toHaveBeenCalled();
    });

    it('should handle signature verification errors', async () => {
      mockProvider.verifyWebhookSignature.mockImplementation(() => {
        throw new Error('Signature verification failed');
      });

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Signature verification failed',
        message: 'Signature verification failed'
      });
    });

    it('should handle immediate responses like Discord PING', async () => {
      mockProvider.parseWebhookPayload.mockReturnValue({
        type: 'ping',
        shouldRespond: true,
        responseData: { type: 1 }
      });

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(res.json).toHaveBeenCalledWith({ type: 1 });
      expect(claudeService.processCommand).not.toHaveBeenCalled();
    });

    it('should skip processing for unknown message types', async () => {
      mockProvider.parseWebhookPayload.mockReturnValue({
        type: 'unknown',
        shouldRespond: false
      });

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Webhook received but no command detected'
      });
      expect(claudeService.processCommand).not.toHaveBeenCalled();
    });

    it('should skip processing when no bot command is found', async () => {
      mockProvider.parseWebhookPayload.mockReturnValue({
        type: 'command',
        content: 'hello world',
        userId: 'user123'
      });
      mockProvider.extractBotCommand.mockReturnValue(null);

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Webhook received but no bot mention found'
      });
      expect(claudeService.processCommand).not.toHaveBeenCalled();
    });

    it('should handle unauthorized users', async () => {
      mockProvider.parseWebhookPayload.mockReturnValue({
        type: 'command',
        content: 'help me',
        userId: 'unauthorized_user',
        username: 'baduser'
      });
      mockProvider.extractBotCommand.mockReturnValue({
        command: 'help me'
      });
      mockProvider.getUserId.mockReturnValue('unauthorized_user');
      mockProvider.isUserAuthorized.mockReturnValue(false);

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(mockProvider.sendResponse).toHaveBeenCalledWith(
        expect.anything(),
        '❌ Sorry, only authorized users can trigger Claude commands.'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Unauthorized user - command ignored',
        context: {
          provider: 'discord',
          userId: 'unauthorized_user'
        }
      });
      expect(claudeService.processCommand).not.toHaveBeenCalled();
    });

    it('should handle Claude service errors gracefully', async () => {
      mockProvider.parseWebhookPayload.mockReturnValue({
        type: 'command',
        content: 'help me',
        userId: 'user123',
        username: 'testuser'
      });
      mockProvider.extractBotCommand.mockReturnValue({
        command: 'help me'
      });
      mockProvider.getUserId.mockReturnValue('user123');
      
      claudeService.processCommand.mockRejectedValue(new Error('Claude service error'));

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(mockProvider.sendResponse).toHaveBeenCalledWith(
        expect.anything(),
        'Error message'
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Failed to process command'
      }));
    });

    it('should handle provider initialization failure', async () => {
      providerFactory.getProvider.mockReturnValue(null);
      providerFactory.createFromEnvironment.mockRejectedValue(new Error('Provider init failed'));

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Provider initialization failed',
        message: 'Provider init failed'
      });
    });

    it('should handle payload parsing errors', async () => {
      mockProvider.parseWebhookPayload.mockImplementation(() => {
        throw new Error('Invalid payload');
      });

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid payload format',
        message: 'Invalid payload'
      });
    });

    it('should handle unexpected errors', async () => {
      providerFactory.getProvider.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await chatbotController.handleChatbotWebhook(req, res, 'discord');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Internal server error',
        provider: 'discord'
      }));
    });
  });

  describe('handleDiscordWebhook', () => {
    it('should call handleChatbotWebhook with discord provider', async () => {
      const spy = jest.spyOn(chatbotController, 'handleChatbotWebhook');
      spy.mockResolvedValue();

      await chatbotController.handleDiscordWebhook(req, res);

      expect(spy).toHaveBeenCalledWith(req, res, 'discord');
      spy.mockRestore();
    });
  });


  describe('getProviderStats', () => {
    it('should return provider statistics successfully', async () => {
      await chatbotController.getProviderStats(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        stats: {
          totalRegistered: 1,
          totalInitialized: 1,
          availableProviders: ['discord'],
          initializedProviders: ['discord']
        },
        providers: {
          discord: {
            name: 'DiscordProvider',
            initialized: true,
            botMention: '@claude'
          }
        },
        timestamp: expect.any(String)
      });
    });

    it('should handle errors when getting stats', async () => {
      providerFactory.getStats.mockImplementation(() => {
        throw new Error('Stats error');
      });

      await chatbotController.getProviderStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to get provider statistics',
        message: 'Stats error'
      });
    });
  });
});