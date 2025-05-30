const DiscordProvider = require('../../../src/providers/DiscordProvider');
const axios = require('axios');

// Mock dependencies
jest.mock('axios');
jest.mock('../../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));


const mockSecureCredentials = require('../../../src/utils/secureCredentials');

describe('DiscordProvider', () => {
  let provider;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };

    // Mock credentials
    mockSecureCredentials.get.mockImplementation(key => {
      const mockCreds = {
        DISCORD_BOT_TOKEN: 'mock_bot_token',
        DISCORD_PUBLIC_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        DISCORD_APPLICATION_ID: '123456789012345678'
      };
      return mockCreds[key];
    });

    provider = new DiscordProvider({
      authorizedUsers: ['user1', 'user2']
    });

    // Reset axios mock
    axios.post.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid credentials', async () => {
      await expect(provider.initialize()).resolves.toBeUndefined();
      expect(provider.botToken).toBe('mock_bot_token');
      expect(provider.publicKey).toBe(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      );
      expect(provider.applicationId).toBe('123456789012345678');
    });

    it('should use environment variables when secure credentials not available', async () => {
      mockSecureCredentials.get.mockReturnValue(null);
      process.env.DISCORD_BOT_TOKEN = 'env_bot_token';
      process.env.DISCORD_PUBLIC_KEY = 'env_public_key';
      process.env.DISCORD_APPLICATION_ID = 'env_app_id';

      await provider.initialize();

      expect(provider.botToken).toBe('env_bot_token');
      expect(provider.publicKey).toBe('env_public_key');
      expect(provider.applicationId).toBe('env_app_id');
    });

    it('should throw error when required credentials are missing', async () => {
      mockSecureCredentials.get.mockReturnValue(null);
      delete process.env.DISCORD_BOT_TOKEN;
      delete process.env.DISCORD_PUBLIC_KEY;

      await expect(provider.initialize()).rejects.toThrow(
        'Discord bot token and public key are required'
      );
    });
  });

  describe('verifyWebhookSignature', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should return false when signature headers are missing', () => {
      const req = { headers: {} };
      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should return false when only timestamp is present', () => {
      const req = {
        headers: { 'x-signature-timestamp': '1234567890' }
      };
      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should return false when only signature is present', () => {
      const req = {
        headers: { 'x-signature-ed25519': 'some_signature' }
      };
      expect(provider.verifyWebhookSignature(req)).toBe(false);
    });

    it('should return true in test mode', () => {
      process.env.NODE_ENV = 'test';
      const req = {
        headers: {
          'x-signature-ed25519': 'invalid_signature',
          'x-signature-timestamp': '1234567890'
        }
      };
      expect(provider.verifyWebhookSignature(req)).toBe(true);
    });

    it('should handle crypto verification errors gracefully', () => {
      // Temporarily override NODE_ENV to ensure signature verification runs
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const req = {
        headers: {
          'x-signature-ed25519': 'invalid_signature_format',
          'x-signature-timestamp': '1234567890'
        },
        rawBody: Buffer.from('test body'),
        body: { test: 'data' }
      };

      // This should not throw, but return false due to invalid signature
      expect(provider.verifyWebhookSignature(req)).toBe(false);

      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('parseWebhookPayload', () => {
    it('should parse PING interaction', () => {
      const payload = { type: 1 };
      const result = provider.parseWebhookPayload(payload);

      expect(result.type).toBe('ping');
      expect(result.shouldRespond).toBe(true);
      expect(result.responseData).toEqual({ type: 1 });
    });

    it('should parse APPLICATION_COMMAND interaction', () => {
      const payload = {
        type: 2,
        data: {
          name: 'help',
          options: [{ name: 'topic', value: 'discord' }]
        },
        channel_id: '123456789',
        guild_id: '987654321',
        member: {
          user: {
            id: 'user123',
            username: 'testuser'
          }
        },
        token: 'interaction_token',
        id: 'interaction_id'
      };

      const result = provider.parseWebhookPayload(payload);

      expect(result.type).toBe('command');
      expect(result.command).toBe('help');
      expect(result.options).toHaveLength(1);
      expect(result.channelId).toBe('123456789');
      expect(result.guildId).toBe('987654321');
      expect(result.userId).toBe('user123');
      expect(result.username).toBe('testuser');
      expect(result.content).toBe('help topic:discord');
      expect(result.interactionToken).toBe('interaction_token');
      expect(result.interactionId).toBe('interaction_id');
      expect(result.repo).toBe(null);
      expect(result.branch).toBe(null);
    });

    it('should parse APPLICATION_COMMAND with repo and branch parameters', () => {
      const payload = {
        type: 2,
        data: {
          name: 'claude',
          options: [
            { name: 'repo', value: 'owner/myrepo' },
            { name: 'branch', value: 'feature-branch' },
            { name: 'command', value: 'fix this bug' }
          ]
        },
        channel_id: '123456789',
        guild_id: '987654321',
        member: {
          user: {
            id: 'user123',
            username: 'testuser'
          }
        },
        token: 'interaction_token',
        id: 'interaction_id'
      };

      const result = provider.parseWebhookPayload(payload);

      expect(result.type).toBe('command');
      expect(result.command).toBe('claude');
      expect(result.options).toHaveLength(3);
      expect(result.repo).toBe('owner/myrepo');
      expect(result.branch).toBe('feature-branch');
      expect(result.content).toBe(
        'claude repo:owner/myrepo branch:feature-branch command:fix this bug'
      );
    });

    it('should parse APPLICATION_COMMAND with repo but no branch (defaults to main)', () => {
      const payload = {
        type: 2,
        data: {
          name: 'claude',
          options: [
            { name: 'repo', value: 'owner/myrepo' },
            { name: 'command', value: 'review this code' }
          ]
        },
        channel_id: '123456789',
        guild_id: '987654321',
        member: {
          user: {
            id: 'user123',
            username: 'testuser'
          }
        },
        token: 'interaction_token',
        id: 'interaction_id'
      };

      const result = provider.parseWebhookPayload(payload);

      expect(result.type).toBe('command');
      expect(result.repo).toBe('owner/myrepo');
      expect(result.branch).toBe('main'); // Default value
      expect(result.content).toBe('claude repo:owner/myrepo command:review this code');
    });

    it('should parse MESSAGE_COMPONENT interaction', () => {
      const payload = {
        type: 3,
        data: {
          custom_id: 'button_click'
        },
        channel_id: '123456789',
        user: {
          id: 'user123',
          username: 'testuser'
        },
        token: 'interaction_token',
        id: 'interaction_id'
      };

      const result = provider.parseWebhookPayload(payload);

      expect(result.type).toBe('component');
      expect(result.customId).toBe('button_click');
      expect(result.userId).toBe('user123');
      expect(result.username).toBe('testuser');
    });

    it('should handle unknown interaction types', () => {
      const payload = { type: 999 };
      const result = provider.parseWebhookPayload(payload);

      expect(result.type).toBe('unknown');
      expect(result.shouldRespond).toBe(false);
    });

    it('should handle payload parsing errors', () => {
      expect(() => provider.parseWebhookPayload(null)).toThrow();
    });
  });

  describe('buildCommandContent', () => {
    it('should build command content with name only', () => {
      const commandData = { name: 'help' };
      const result = provider.buildCommandContent(commandData);
      expect(result).toBe('help');
    });

    it('should build command content with options', () => {
      const commandData = {
        name: 'help',
        options: [
          { name: 'topic', value: 'discord' },
          { name: 'format', value: 'detailed' }
        ]
      };
      const result = provider.buildCommandContent(commandData);
      expect(result).toBe('help topic:discord format:detailed');
    });

    it('should handle empty command data', () => {
      expect(provider.buildCommandContent(null)).toBe('');
      expect(provider.buildCommandContent(undefined)).toBe('');
      expect(provider.buildCommandContent({})).toBe('');
    });
  });

  describe('extractBotCommand', () => {
    it('should extract command from content', () => {
      const result = provider.extractBotCommand('help me with discord');
      expect(result.command).toBe('help me with discord');
      expect(result.originalMessage).toBe('help me with discord');
    });

    it('should return null for empty content', () => {
      expect(provider.extractBotCommand('')).toBeNull();
      expect(provider.extractBotCommand(null)).toBeNull();
      expect(provider.extractBotCommand(undefined)).toBeNull();
    });
  });

  describe('extractRepoAndBranch', () => {
    it('should extract repo and branch from command options', () => {
      const commandData = {
        name: 'claude',
        options: [
          { name: 'repo', value: 'owner/myrepo' },
          { name: 'branch', value: 'feature-branch' },
          { name: 'command', value: 'fix this' }
        ]
      };

      const result = provider.extractRepoAndBranch(commandData);
      expect(result.repo).toBe('owner/myrepo');
      expect(result.branch).toBe('feature-branch');
    });

    it('should default branch to main when not provided', () => {
      const commandData = {
        name: 'claude',
        options: [
          { name: 'repo', value: 'owner/myrepo' },
          { name: 'command', value: 'fix this' }
        ]
      };

      const result = provider.extractRepoAndBranch(commandData);
      expect(result.repo).toBe('owner/myrepo');
      expect(result.branch).toBe('main');
    });

    it('should return null values when no repo option provided', () => {
      const commandData = { name: 'claude' };
      const result = provider.extractRepoAndBranch(commandData);
      expect(result.repo).toBe(null);
      expect(result.branch).toBe(null);
    });

    it('should handle empty or null command data', () => {
      expect(provider.extractRepoAndBranch(null)).toEqual({ repo: null, branch: null });
      expect(provider.extractRepoAndBranch({})).toEqual({ repo: null, branch: null });
    });
  });

  describe('sendResponse', () => {
    beforeEach(async () => {
      await provider.initialize();
      axios.post.mockResolvedValue({ data: { id: 'message_id' } });
    });

    it('should skip response for ping interactions', async () => {
      const context = { type: 'ping' };
      await provider.sendResponse(context, 'test response');
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should send follow-up message for interactions with token', async () => {
      const context = {
        type: 'command',
        interactionToken: 'test_token',
        interactionId: 'test_id'
      };

      await provider.sendResponse(context, 'test response');

      expect(axios.post).toHaveBeenCalledWith(
        `https://discord.com/api/v10/webhooks/${provider.applicationId}/test_token`,
        { content: 'test response', flags: 0 },
        {
          headers: {
            Authorization: `Bot ${provider.botToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('should send channel message when no interaction token', async () => {
      const context = {
        type: 'command',
        channelId: '123456789'
      };

      await provider.sendResponse(context, 'test response');

      expect(axios.post).toHaveBeenCalledWith(
        'https://discord.com/api/v10/channels/123456789/messages',
        { content: 'test response' },
        {
          headers: {
            Authorization: `Bot ${provider.botToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('should handle axios errors', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      const context = {
        type: 'command',
        channelId: '123456789'
      };

      await expect(provider.sendResponse(context, 'test response')).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('splitLongMessage', () => {
    it('should return single message when under limit', () => {
      const result = provider.splitLongMessage('short message', 2000);
      expect(result).toEqual(['short message']);
    });

    it('should split long messages by lines', () => {
      const longMessage = 'line1\n'.repeat(50) + 'final line';
      const result = provider.splitLongMessage(longMessage, 100);
      expect(result.length).toBeGreaterThan(1);
      expect(result.every(msg => msg.length <= 100)).toBe(true);
    });

    it('should split very long single lines', () => {
      const longLine = 'a'.repeat(3000);
      const result = provider.splitLongMessage(longLine, 2000);
      expect(result.length).toBe(2);
      expect(result[0].length).toBe(2000);
      expect(result[1].length).toBe(1000);
    });
  });

  describe('getUserId', () => {
    it('should return userId from context', () => {
      const context = { userId: 'user123' };
      expect(provider.getUserId(context)).toBe('user123');
    });
  });

  describe('formatErrorMessage', () => {
    it('should format Discord-specific error message', () => {
      const error = new Error('Test error');
      const errorId = 'test-123';

      const message = provider.formatErrorMessage(error, errorId);

      expect(message).toContain('🚫 **Error Processing Command**');
      expect(message).toContain('**Reference ID:** `test-123`');
      expect(message).toContain('Please contact an administrator');
    });
  });

  describe('getBotMention', () => {
    it('should return Discord-specific bot mention', () => {
      const provider = new DiscordProvider({ botMention: 'custombot' });
      expect(provider.getBotMention()).toBe('custombot');
    });

    it('should return default bot mention', () => {
      const provider = new DiscordProvider();
      expect(provider.getBotMention()).toBe('claude');
    });
  });
});
