import { createLogger } from '../../utils/logger';
import type {
  WebhookProvider,
  WebhookEventHandler,
  WebhookRegistry as IWebhookRegistry
} from '../../types/webhook';

const logger = createLogger('WebhookRegistry');

/**
 * Registry for managing webhook providers and their event handlers
 */
export class WebhookRegistry implements IWebhookRegistry {
  private providers: Map<string, WebhookProvider> = new Map();
  private handlers: Map<string, WebhookEventHandler[]> = new Map();

  /**
   * Register a webhook provider
   */
  registerProvider(provider: WebhookProvider): void {
    if (this.providers.has(provider.name)) {
      logger.warn(`Provider ${provider.name} is already registered. Overwriting.`);
    }

    this.providers.set(provider.name, provider);
    logger.info(`Registered webhook provider: ${provider.name}`);
  }

  /**
   * Register an event handler for a specific provider
   */
  registerHandler(providerName: string, handler: WebhookEventHandler): void {
    const key = this.getHandlerKey(providerName);
    const handlers = this.handlers.get(key) ?? [];

    handlers.push(handler);

    // Sort by priority (higher priority first)
    handlers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    this.handlers.set(key, handlers);

    const eventPattern = handler.event instanceof RegExp ? handler.event.toString() : handler.event;

    logger.info(
      `Registered handler for ${providerName}: ${eventPattern} (priority: ${handler.priority ?? 0})`
    );
  }

  /**
   * Get a provider by name
   */
  getProvider(name: string): WebhookProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): WebhookProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get handlers for a specific provider and event
   */
  getHandlers(providerName: string, event: string): WebhookEventHandler[] {
    const key = this.getHandlerKey(providerName);
    const allHandlers = this.handlers.get(key) ?? [];

    return allHandlers.filter(handler => {
      if (typeof handler.event === 'string') {
        // Exact match or wildcard match
        if (handler.event === event) return true;
        if (handler.event.endsWith('*')) {
          const prefix = handler.event.slice(0, -1);
          return event.startsWith(prefix);
        }
        return false;
      } else if (handler.event instanceof RegExp) {
        return handler.event.test(event);
      }
      return false;
    });
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.providers.clear();
    this.handlers.clear();
    logger.info('Cleared all webhook registrations');
  }

  /**
   * Get the total number of registered handlers
   */
  getHandlerCount(providerName?: string): number {
    if (providerName) {
      const key = this.getHandlerKey(providerName);
      return this.handlers.get(key)?.length ?? 0;
    }

    let total = 0;
    for (const handlers of this.handlers.values()) {
      total += handlers.length;
    }
    return total;
  }

  /**
   * Check if a provider is registered
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get handler key for storage
   */
  private getHandlerKey(providerName: string): string {
    return providerName.toLowerCase();
  }
}

// Export singleton instance
export const webhookRegistry = new WebhookRegistry();
