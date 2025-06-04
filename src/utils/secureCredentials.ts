import fs from 'fs';
import { logger } from './logger';

interface CredentialConfig {
  file: string;
  env: string;
}

interface CredentialMappings {
  [key: string]: CredentialConfig;
}

/**
 * Secure credential loader - reads from files instead of env vars
 * Files are mounted as Docker secrets or regular files
 */
class SecureCredentials {
  private credentials: Map<string, string>;

  constructor() {
    this.credentials = new Map();
    this.loadCredentials();
  }

  /**
   * Load credentials from files or fallback to env vars
   */
  private loadCredentials(): void {
    const credentialMappings: CredentialMappings = {
      GITHUB_TOKEN: {
        file: process.env['GITHUB_TOKEN_FILE'] ?? '/run/secrets/github_token',
        env: 'GITHUB_TOKEN'
      },
      ANTHROPIC_API_KEY: {
        file: process.env['ANTHROPIC_API_KEY_FILE'] ?? '/run/secrets/anthropic_api_key',
        env: 'ANTHROPIC_API_KEY'
      },
      GITHUB_WEBHOOK_SECRET: {
        file: process.env['GITHUB_WEBHOOK_SECRET_FILE'] ?? '/run/secrets/webhook_secret',
        env: 'GITHUB_WEBHOOK_SECRET'
      },
      CLAUDE_WEBHOOK_SECRET: {
        file: process.env['CLAUDE_WEBHOOK_SECRET_FILE'] ?? '/run/secrets/claude_webhook_secret',
        env: 'CLAUDE_WEBHOOK_SECRET'
      }
    };

    for (const [key, config] of Object.entries(credentialMappings)) {
      let value: string | null = null;

      // Try to read from file first (most secure)
      try {
        // eslint-disable-next-line no-sync
        if (fs.existsSync(config.file)) {
          // eslint-disable-next-line no-sync
          value = fs.readFileSync(config.file, 'utf8').trim();
          logger.info(`Loaded ${key} from secure file: ${config.file}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn(`Failed to read ${key} from file ${config.file}: ${errorMessage}`);
      }

      // Fallback to environment variable (less secure)
      if (!value && process.env[config.env]) {
        value = process.env[config.env] as string;
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
   */
  get(key: string): string | null {
    return this.credentials.get(key) ?? null;
  }

  /**
   * Check if credential exists
   */
  has(key: string): boolean {
    return this.credentials.has(key);
  }

  /**
   * Get all available credential keys (for debugging)
   */
  getAvailableKeys(): string[] {
    return Array.from(this.credentials.keys());
  }

  /**
   * Reload credentials (useful for credential rotation)
   */
  reload(): void {
    this.credentials.clear();
    this.loadCredentials();
    logger.info('Credentials reloaded');
  }

  /**
   * Add or update a credential programmatically
   */
  set(key: string, value: string): void {
    this.credentials.set(key, value);
    logger.debug(`Credential ${key} updated programmatically`);
  }

  /**
   * Remove a credential
   */
  delete(key: string): boolean {
    const deleted = this.credentials.delete(key);
    if (deleted) {
      logger.debug(`Credential ${key} removed`);
    }
    return deleted;
  }

  /**
   * Get credential count
   */
  size(): number {
    return this.credentials.size;
  }
}

// Create singleton instance
const secureCredentials = new SecureCredentials();

export default secureCredentials;
export { SecureCredentials };
