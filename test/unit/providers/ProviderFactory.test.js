// Mock dependencies
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

const ProviderFactory = require('../../../src/providers/ProviderFactory');
const DiscordProvider = require('../../../src/providers/DiscordProvider');
const ChatbotProvider = require('../../../src/providers/ChatbotProvider');

// Mock DiscordProvider to avoid initialization issues in tests
const mockDiscordProvider = jest.fn();
mockDiscordProvider.mockImplementation((config) => {
  const instance = {
    initialize: jest.fn().mockResolvedValue(),
    config,
    getProviderName: jest.fn().mockReturnValue('DiscordProvider')
  };
  Object.setPrototypeOf(instance, mockDiscordProvider.prototype);
  return instance;
});

jest.mock('../../../src/providers/DiscordProvider', () => mockDiscordProvider);

describe('ProviderFactory', () => {
  let factory;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    
    // Clear the factory singleton and create fresh instance for each test
    jest.resetModules();
    const ProviderFactoryClass = require('../../../src/providers/ProviderFactory').constructor;
    factory = new ProviderFactoryClass();
    
    // Mock DiscordProvider
    DiscordProvider.mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(),
      getProviderName: jest.fn().mockReturnValue('DiscordProvider'),
      getBotMention: jest.fn().mockReturnValue('@claude')
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with discord provider registered', () => {
      expect(factory.getAvailableProviders()).toContain('discord');
    });

    it('should start with empty providers map', () => {
      expect(factory.getAllProviders().size).toBe(0);
    });
  });

  describe('registerProvider', () => {
    class TestProvider extends ChatbotProvider {
      async initialize() {}
      verifyWebhookSignature() { return true; }
      parseWebhookPayload() { return {}; }
      extractBotCommand() { return null; }
      async sendResponse() {}
      getUserId() { return 'test'; }
    }

    it('should register new provider', () => {
      factory.registerProvider('test', TestProvider);
      expect(factory.getAvailableProviders()).toContain('test');
    });

    it('should handle case-insensitive provider names', () => {
      factory.registerProvider('TEST', TestProvider);
      expect(factory.getAvailableProviders()).toContain('test');
    });
  });

  describe('createProvider', () => {
    it('should create and cache discord provider', async () => {
      const provider = await factory.createProvider('discord');
      expect(provider).toBeInstanceOf(DiscordProvider);
      expect(DiscordProvider).toHaveBeenCalledWith({});
      
      // Should return cached instance on second call
      const provider2 = await factory.createProvider('discord');
      expect(provider2).toBe(provider);
      expect(DiscordProvider).toHaveBeenCalledTimes(1);
    });

    it('should create provider with custom config', async () => {
      const config = { botMention: '@custombot', authorizedUsers: ['user1'] };
      await factory.createProvider('discord', config);
      
      expect(DiscordProvider).toHaveBeenCalledWith(config);
    });

    it('should merge with default config', async () => {
      factory.setDefaultConfig({ globalSetting: true });
      const config = { botMention: '@custombot' };
      
      await factory.createProvider('discord', config);
      
      expect(DiscordProvider).toHaveBeenCalledWith({
        globalSetting: true,
        botMention: '@custombot'
      });
    });

    it('should throw error for unknown provider', async () => {
      await expect(factory.createProvider('unknown')).rejects.toThrow(
        'Unknown provider: unknown. Available providers: discord'
      );
    });

    it('should handle provider initialization errors', async () => {
      DiscordProvider.mockImplementation(() => {
        throw new Error('Initialization failed');
      });

      await expect(factory.createProvider('discord')).rejects.toThrow(
        'Failed to create discord provider: Initialization failed'
      );
    });
  });

  describe('getProvider', () => {
    it('should return existing provider', async () => {
      const provider = await factory.createProvider('discord');
      expect(factory.getProvider('discord')).toBe(provider);
    });

    it('should return null for non-existent provider', () => {
      expect(factory.getProvider('nonexistent')).toBeNull();
    });

    it('should be case-insensitive', async () => {
      const provider = await factory.createProvider('discord');
      expect(factory.getProvider('DISCORD')).toBe(provider);
    });
  });

  describe('setDefaultConfig', () => {
    it('should set default configuration', () => {
      const config = { globalSetting: true, defaultUser: 'admin' };
      factory.setDefaultConfig(config);
      expect(factory.defaultConfig).toEqual(config);
    });
  });

  describe('updateProviderConfig', () => {
    it('should recreate provider with new config', async () => {
      // Create initial provider
      await factory.createProvider('discord', { botMention: '@oldbot' });
      expect(DiscordProvider).toHaveBeenCalledTimes(1);

      // Update config
      await factory.updateProviderConfig('discord', { botMention: '@newbot' });
      expect(DiscordProvider).toHaveBeenCalledTimes(2);
      expect(DiscordProvider).toHaveBeenLastCalledWith({ botMention: '@newbot' });
    });
  });

  describe('getEnvironmentConfig', () => {
    it('should extract Discord config from environment', () => {
      process.env.DISCORD_BOT_TOKEN = 'test_token';
      process.env.DISCORD_PUBLIC_KEY = 'test_key';
      process.env.DISCORD_APPLICATION_ID = 'test_id';
      process.env.DISCORD_AUTHORIZED_USERS = 'user1,user2,user3';
      process.env.DISCORD_BOT_MENTION = '@discordbot';

      const config = factory.getEnvironmentConfig('discord');

      expect(config).toEqual({
        botToken: 'test_token',
        publicKey: 'test_key',
        applicationId: 'test_id',
        authorizedUsers: ['user1', 'user2', 'user3'],
        botMention: '@discordbot'
      });
    });


    it('should remove undefined values from config', () => {
      // Only set some env vars
      process.env.DISCORD_BOT_TOKEN = 'test_token';
      // Don't set DISCORD_PUBLIC_KEY

      const config = factory.getEnvironmentConfig('discord');

      expect(config).toEqual({
        botToken: 'test_token'
      });
      expect(config.hasOwnProperty('publicKey')).toBe(false);
    });
  });

  describe('createFromEnvironment', () => {
    it('should create provider using environment config', async () => {
      process.env.DISCORD_BOT_TOKEN = 'env_token';
      process.env.DISCORD_AUTHORIZED_USERS = 'envuser1,envuser2';

      await factory.createFromEnvironment('discord');

      expect(DiscordProvider).toHaveBeenCalledWith({
        botToken: 'env_token',
        authorizedUsers: ['envuser1', 'envuser2']
      });
    });
  });

  describe('createMultipleProviders', () => {
    class MockTestProvider extends ChatbotProvider {
      async initialize() {}
      verifyWebhookSignature() { return true; }
      parseWebhookPayload() { return {}; }
      extractBotCommand() { return null; }
      async sendResponse() {}
      getUserId() { return 'test'; }
    }

    beforeEach(() => {
      factory.registerProvider('test', MockTestProvider);
    });

    it('should create multiple providers successfully', async () => {
      const config = {
        discord: { botMention: '@discord' },
        test: { botMention: '@test' }
      };

      const results = await factory.createMultipleProviders(config);

      expect(results.size).toBe(2);
      expect(results.has('discord')).toBe(true);
      expect(results.has('test')).toBe(true);
    });

    it('should handle partial failures gracefully', async () => {
      const config = {
        discord: { botMention: '@discord' },
        unknown: { botMention: '@unknown' }
      };

      const results = await factory.createMultipleProviders(config);

      expect(results.size).toBe(1);
      expect(results.has('discord')).toBe(true);
      expect(results.has('unknown')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clear all providers', async () => {
      await factory.createProvider('discord');
      expect(factory.getAllProviders().size).toBe(1);

      await factory.cleanup();
      expect(factory.getAllProviders().size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return provider statistics', async () => {
      await factory.createProvider('discord');
      
      const stats = factory.getStats();

      expect(stats).toEqual({
        totalRegistered: 1,
        totalInitialized: 1,
        availableProviders: ['discord'],
        initializedProviders: ['discord']
      });
    });

    it('should return correct stats when no providers initialized', () => {
      const stats = factory.getStats();

      expect(stats).toEqual({
        totalRegistered: 1, // discord is registered by default
        totalInitialized: 0,
        availableProviders: ['discord'],
        initializedProviders: []
      });
    });
  });

  describe('singleton behavior', () => {
    it('should be a singleton when imported normally', () => {
      // This tests the actual exported singleton
      const factory1 = require('../../../src/providers/ProviderFactory');
      const factory2 = require('../../../src/providers/ProviderFactory');
      
      expect(factory1).toBe(factory2);
    });
  });
});