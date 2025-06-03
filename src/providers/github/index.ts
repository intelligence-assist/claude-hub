import { webhookRegistry } from '../../core/webhook/WebhookRegistry';
import { GitHubWebhookProvider } from './GitHubWebhookProvider';
import { IssueOpenedHandler } from './handlers/IssueHandler';
import { createLogger } from '../../utils/logger';

const logger = createLogger('GitHubProvider');

/**
 * Initialize GitHub webhook provider and handlers
 */
export function initializeGitHubProvider(): void {
  logger.info('Initializing GitHub webhook provider');

  // Register the provider
  const provider = new GitHubWebhookProvider();
  webhookRegistry.registerProvider(provider);

  // Register handlers
  webhookRegistry.registerHandler('github', new IssueOpenedHandler());

  logger.info('GitHub webhook provider initialized with handlers');
}

// Auto-initialize when imported
initializeGitHubProvider();
