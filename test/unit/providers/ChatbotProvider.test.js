const ChatbotProvider = require('../../../src/providers/ChatbotProvider');

describe('ChatbotProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new ChatbotProvider({
      botMention: '@testbot',
      authorizedUsers: ['user1', 'user2']
    });
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultProvider = new ChatbotProvider();
      expect(defaultProvider.config).toEqual({});
      expect(defaultProvider.name).toBe('ChatbotProvider');
    });

    it('should initialize with provided config', () => {
      expect(provider.config.botMention).toBe('@testbot');
      expect(provider.config.authorizedUsers).toEqual(['user1', 'user2']);
    });
  });

  describe('abstract methods', () => {
    it('should throw error for initialize()', async () => {
      await expect(provider.initialize()).rejects.toThrow('initialize() must be implemented by subclass');
    });

    it('should throw error for verifyWebhookSignature()', () => {
      expect(() => provider.verifyWebhookSignature({})).toThrow('verifyWebhookSignature() must be implemented by subclass');
    });

    it('should throw error for parseWebhookPayload()', () => {
      expect(() => provider.parseWebhookPayload({})).toThrow('parseWebhookPayload() must be implemented by subclass');
    });

    it('should throw error for extractBotCommand()', () => {
      expect(() => provider.extractBotCommand('')).toThrow('extractBotCommand() must be implemented by subclass');
    });

    it('should throw error for sendResponse()', async () => {
      await expect(provider.sendResponse({}, '')).rejects.toThrow('sendResponse() must be implemented by subclass');
    });

    it('should throw error for getUserId()', () => {
      expect(() => provider.getUserId({})).toThrow('getUserId() must be implemented by subclass');
    });
  });

  describe('formatErrorMessage()', () => {
    it('should format error message with reference ID and timestamp', () => {
      const error = new Error('Test error');
      const errorId = 'test-123';
      
      const message = provider.formatErrorMessage(error, errorId);
      
      expect(message).toContain('❌ An error occurred');
      expect(message).toContain('Reference: test-123');
      expect(message).toContain('Please check with an administrator');
    });
  });

  describe('isUserAuthorized()', () => {
    it('should return false for null/undefined userId', () => {
      expect(provider.isUserAuthorized(null)).toBe(false);
      expect(provider.isUserAuthorized(undefined)).toBe(false);
      expect(provider.isUserAuthorized('')).toBe(false);
    });

    it('should return true for authorized users from config', () => {
      expect(provider.isUserAuthorized('user1')).toBe(true);
      expect(provider.isUserAuthorized('user2')).toBe(true);
    });

    it('should return false for unauthorized users', () => {
      expect(provider.isUserAuthorized('unauthorized')).toBe(false);
    });

    it('should use environment variables when no config provided', () => {
      const originalEnv = process.env.AUTHORIZED_USERS;
      process.env.AUTHORIZED_USERS = 'envuser1,envuser2';
      
      const envProvider = new ChatbotProvider();
      
      expect(envProvider.isUserAuthorized('envuser1')).toBe(true);
      expect(envProvider.isUserAuthorized('envuser2')).toBe(true);
      expect(envProvider.isUserAuthorized('unauthorized')).toBe(false);
      
      process.env.AUTHORIZED_USERS = originalEnv;
    });

    it('should use default authorized user when no config or env provided', () => {
      const originalUsers = process.env.AUTHORIZED_USERS;
      const originalDefault = process.env.DEFAULT_AUTHORIZED_USER;
      
      delete process.env.AUTHORIZED_USERS;
      process.env.DEFAULT_AUTHORIZED_USER = 'defaultuser';
      
      const defaultProvider = new ChatbotProvider();
      
      expect(defaultProvider.isUserAuthorized('defaultuser')).toBe(true);
      expect(defaultProvider.isUserAuthorized('other')).toBe(false);
      
      process.env.AUTHORIZED_USERS = originalUsers;
      process.env.DEFAULT_AUTHORIZED_USER = originalDefault;
    });

    it('should fallback to admin when no config provided', () => {
      const originalUsers = process.env.AUTHORIZED_USERS;
      const originalDefault = process.env.DEFAULT_AUTHORIZED_USER;
      
      delete process.env.AUTHORIZED_USERS;
      delete process.env.DEFAULT_AUTHORIZED_USER;
      
      const fallbackProvider = new ChatbotProvider();
      
      expect(fallbackProvider.isUserAuthorized('admin')).toBe(true);
      expect(fallbackProvider.isUserAuthorized('other')).toBe(false);
      
      process.env.AUTHORIZED_USERS = originalUsers;
      process.env.DEFAULT_AUTHORIZED_USER = originalDefault;
    });
  });

  describe('getProviderName()', () => {
    it('should return the class name', () => {
      expect(provider.getProviderName()).toBe('ChatbotProvider');
    });
  });

  describe('getBotMention()', () => {
    it('should return bot mention from config', () => {
      expect(provider.getBotMention()).toBe('@testbot');
    });

    it('should return bot mention from environment variable', () => {
      const originalEnv = process.env.BOT_USERNAME;
      process.env.BOT_USERNAME = '@envbot';
      
      const envProvider = new ChatbotProvider();
      
      expect(envProvider.getBotMention()).toBe('@envbot');
      
      process.env.BOT_USERNAME = originalEnv;
    });

    it('should return default bot mention when no config provided', () => {
      const originalEnv = process.env.BOT_USERNAME;
      delete process.env.BOT_USERNAME;
      
      const defaultProvider = new ChatbotProvider();
      
      expect(defaultProvider.getBotMention()).toBe('@ClaudeBot');
      
      process.env.BOT_USERNAME = originalEnv;
    });
  });
});

// Test concrete implementation to verify inheritance works correctly
class TestChatbotProvider extends ChatbotProvider {
  async initialize() {
    this.initialized = true;
  }

  verifyWebhookSignature(req) {
    return req.valid === true;
  }

  parseWebhookPayload(payload) {
    return { type: 'test', content: payload.message };
  }

  extractBotCommand(message) {
    if (message.includes('@testbot')) {
      return { command: message.replace('@testbot', '').trim() };
    }
    return null;
  }

  async sendResponse(context, response) {
    context.lastResponse = response;
  }

  getUserId(context) {
    return context.userId;
  }
}

describe('ChatbotProvider inheritance', () => {
  let testProvider;

  beforeEach(() => {
    testProvider = new TestChatbotProvider({ botMention: '@testbot' });
  });

  it('should allow concrete implementation to override abstract methods', async () => {
    await testProvider.initialize();
    expect(testProvider.initialized).toBe(true);

    expect(testProvider.verifyWebhookSignature({ valid: true })).toBe(true);
    expect(testProvider.verifyWebhookSignature({ valid: false })).toBe(false);

    const parsed = testProvider.parseWebhookPayload({ message: 'hello' });
    expect(parsed.type).toBe('test');
    expect(parsed.content).toBe('hello');

    const command = testProvider.extractBotCommand('@testbot help me');
    expect(command.command).toBe('help me');

    const context = { userId: '123' };
    await testProvider.sendResponse(context, 'test response');
    expect(context.lastResponse).toBe('test response');

    expect(testProvider.getUserId({ userId: '456' })).toBe('456');
  });

  it('should inherit base class utility methods', () => {
    expect(testProvider.getProviderName()).toBe('TestChatbotProvider');
    expect(testProvider.getBotMention()).toBe('@testbot');
    expect(testProvider.isUserAuthorized).toBeDefined();
    expect(testProvider.formatErrorMessage).toBeDefined();
  });
});