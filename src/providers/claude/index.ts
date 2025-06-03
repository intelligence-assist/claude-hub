import { webhookRegistry } from '../../core/webhook/WebhookRegistry';
import { ClaudeWebhookProvider } from './ClaudeWebhookProvider';
import { OrchestrationHandler } from './handlers/OrchestrationHandler';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ClaudeProvider');

// Register the Claude provider
const provider = new ClaudeWebhookProvider();
webhookRegistry.registerProvider(provider);

// Register handlers
webhookRegistry.registerHandler('claude', new OrchestrationHandler());

logger.info('Claude webhook provider initialized');

export { ClaudeWebhookProvider };
export * from './handlers/OrchestrationHandler';
export * from './services/SessionManager';
export * from './services/TaskDecomposer';
