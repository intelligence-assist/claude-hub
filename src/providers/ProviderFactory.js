const DiscordProvider = require('./DiscordProvider');
const { createLogger } = require('../utils/logger');

const logger = createLogger('ProviderFactory');

/**
 * Provider factory for chatbot providers using dependency injection
 * Manages the creation and configuration of different chatbot providers
 */
class ProviderFactory {
  constructor() {
    this.providers = new Map();
    this.providerClasses = new Map();
    this.defaultConfig = {};

    // Register built-in providers
    this.registerProvider('discord', DiscordProvider);
  }

  /**
   * Register a new provider class
   * @param {string} name - Provider name
   * @param {class} ProviderClass - Provider class constructor
   */
  registerProvider(name, ProviderClass) {
    this.providerClasses.set(name.toLowerCase(), ProviderClass);
    logger.info({ provider: name }, 'Registered chatbot provider');
  }

  /**
   * Create and initialize a provider instance
   * @param {string} name - Provider name
   * @param {Object} config - Provider configuration
   * @returns {Promise<ChatbotProvider>} - Initialized provider instance
   */
  async createProvider(name, config = {}) {
    const providerName = name.toLowerCase();

    // Check if provider is already created
    if (this.providers.has(providerName)) {
      return this.providers.get(providerName);
    }

    // Get provider class
    const ProviderClass = this.providerClasses.get(providerName);
    if (!ProviderClass) {
      const availableProviders = Array.from(this.providerClasses.keys());
      throw new Error(
        `Unknown provider: ${name}. Available providers: ${availableProviders.join(', ')}`
      );
    }

    try {
      // Merge with default config
      const finalConfig = { ...this.defaultConfig, ...config };

      // Create and initialize provider
      const provider = new ProviderClass(finalConfig);
      await provider.initialize();

      // Cache the provider
      this.providers.set(providerName, provider);

      logger.info(
        {
          provider: name,
          config: Object.keys(finalConfig)
        },
        'Created and initialized chatbot provider'
      );

      return provider;
    } catch (error) {
      logger.error(
        {
          err: error,
          provider: name
        },
        'Failed to create provider'
      );
      throw new Error(`Failed to create ${name} provider: ${error.message}`);
    }
  }

  /**
   * Get an existing provider instance
   * @param {string} name - Provider name
   * @returns {ChatbotProvider|null} - Provider instance or null if not found
   */
  getProvider(name) {
    return this.providers.get(name.toLowerCase()) || null;
  }

  /**
   * Get all initialized provider instances
   * @returns {Map<string, ChatbotProvider>} - Map of provider name to instance
   */
  getAllProviders() {
    return new Map(this.providers);
  }

  /**
   * Get list of available provider names
   * @returns {string[]} - Array of available provider names
   */
  getAvailableProviders() {
    return Array.from(this.providerClasses.keys());
  }

  /**
   * Set default configuration for all providers
   * @param {Object} config - Default configuration
   */
  setDefaultConfig(config) {
    this.defaultConfig = { ...config };
    logger.info({ configKeys: Object.keys(config) }, 'Set default provider configuration');
  }

  /**
   * Update configuration for a specific provider
   * @param {string} name - Provider name
   * @param {Object} config - Updated configuration
   * @returns {Promise<ChatbotProvider>} - Updated provider instance
   */
  async updateProviderConfig(name, config) {
    const providerName = name.toLowerCase();

    // Remove existing provider to force recreation with new config
    if (this.providers.has(providerName)) {
      this.providers.delete(providerName);
      logger.info({ provider: name }, 'Removed existing provider for reconfiguration');
    }

    // Create new provider with updated config
    return await this.createProvider(name, config);
  }

  /**
   * Create provider from environment configuration
   * @param {string} name - Provider name
   * @returns {Promise<ChatbotProvider>} - Configured provider instance
   */
  async createFromEnvironment(name) {
    const providerName = name.toLowerCase();
    const config = this.getEnvironmentConfig(providerName);

    return await this.createProvider(name, config);
  }

  /**
   * Get provider configuration from environment variables
   * @param {string} providerName - Provider name
   * @returns {Object} - Configuration object
   */
  getEnvironmentConfig(providerName) {
    const config = {};

    // Provider-specific environment variables
    switch (providerName) {
      case 'discord':
        config.botToken = process.env.DISCORD_BOT_TOKEN;
        config.publicKey = process.env.DISCORD_PUBLIC_KEY;
        config.applicationId = process.env.DISCORD_APPLICATION_ID;
        config.authorizedUsers = process.env.DISCORD_AUTHORIZED_USERS?.split(',').map(u =>
          u.trim()
        );
        config.botMention = process.env.DISCORD_BOT_MENTION;
        break;
      default:
        throw new Error(
          `Unsupported provider: ${providerName}. Only 'discord' is currently supported.`
        );
    }

    // Remove undefined values
    Object.keys(config).forEach(key => {
      if (config[key] === undefined) {
        delete config[key];
      }
    });

    return config;
  }

  /**
   * Create multiple providers from configuration
   * @param {Object} providersConfig - Configuration for multiple providers
   * @returns {Promise<Map<string, ChatbotProvider>>} - Map of initialized providers
   */
  async createMultipleProviders(providersConfig) {
    const results = new Map();
    const errors = [];

    for (const [name, config] of Object.entries(providersConfig)) {
      try {
        const provider = await this.createProvider(name, config);
        results.set(name, provider);
      } catch (error) {
        errors.push({ provider: name, error: error.message });
        logger.error(
          {
            err: error,
            provider: name
          },
          'Failed to create provider in batch'
        );
      }
    }

    if (errors.length > 0) {
      logger.warn({ errors, successCount: results.size }, 'Some providers failed to initialize');
    }

    return results;
  }

  /**
   * Clean up all providers
   */
  async cleanup() {
    logger.info({ providerCount: this.providers.size }, 'Cleaning up chatbot providers');

    this.providers.clear();
    logger.info('All providers cleaned up');
  }

  /**
   * Get provider statistics
   * @returns {Object} - Provider statistics
   */
  getStats() {
    const stats = {
      totalRegistered: this.providerClasses.size,
      totalInitialized: this.providers.size,
      availableProviders: this.getAvailableProviders(),
      initializedProviders: Array.from(this.providers.keys())
    };

    return stats;
  }
}

// Create singleton instance
const factory = new ProviderFactory();

module.exports = factory;
