const fs = require('fs');
const { logger } = require('./logger');

/**
 * Secure credential loader - reads from files instead of env vars
 * Files are mounted as Docker secrets or regular files
 */
class SecureCredentials {
  constructor() {
    this.credentials = new Map();
    this.loadCredentials();
  }

  /**
   * Load credentials from files or fallback to env vars
   */
  loadCredentials() {
    const credentialMappings = {
      GITHUB_TOKEN: {
        file: process.env.GITHUB_TOKEN_FILE || '/run/secrets/github_token',
        env: 'GITHUB_TOKEN'
      },
      ANTHROPIC_API_KEY: {
        file: process.env.ANTHROPIC_API_KEY_FILE || '/run/secrets/anthropic_api_key',
        env: 'ANTHROPIC_API_KEY'
      },
      GITHUB_WEBHOOK_SECRET: {
        file: process.env.GITHUB_WEBHOOK_SECRET_FILE || '/run/secrets/webhook_secret',
        env: 'GITHUB_WEBHOOK_SECRET'
      }
    };

    for (const [key, config] of Object.entries(credentialMappings)) {
      let value = null;

      // Try to read from file first (most secure)
      try {
        // eslint-disable-next-line no-sync
        if (fs.existsSync(config.file)) {
          // eslint-disable-next-line no-sync
          value = fs.readFileSync(config.file, 'utf8').trim();
          logger.info(`Loaded ${key} from secure file: ${config.file}`);
        }
      } catch (error) {
        logger.warn(`Failed to read ${key} from file ${config.file}: ${error.message}`);
      }

      // Fallback to environment variable (less secure)
      if (!value && process.env[config.env]) {
        value = process.env[config.env];
        logger.warn(`Using ${key} from environment variable (less secure)`);
      }

      if (value) {
        this.credentials.set(key, value);
      } else {
        logger.error(`No credential found for ${key}`);
      }
    }
  }

  /**
   * Get credential value
   * @param {string} key - Credential key
   * @returns {string|null} - Credential value or null if not found
   */
  get(key) {
    return this.credentials.get(key) || null;
  }

  /**
   * Check if credential exists
   * @param {string} key - Credential key
   * @returns {boolean}
   */
  has(key) {
    return this.credentials.has(key);
  }

  /**
   * Get all available credential keys (for debugging)
   * @returns {string[]}
   */
  getAvailableKeys() {
    return Array.from(this.credentials.keys());
  }

  /**
   * Reload credentials (useful for credential rotation)
   */
  reload() {
    this.credentials.clear();
    this.loadCredentials();
    logger.info('Credentials reloaded');
  }
}

// Create singleton instance
const secureCredentials = new SecureCredentials();

module.exports = secureCredentials;
