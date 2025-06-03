import type { Response } from 'express';
import type { WebhookRequest } from '../../types/express';
import { createLogger } from '../../utils/logger';
import { webhookRegistry } from './WebhookRegistry';
import type {
  BaseWebhookPayload,
  WebhookContext,
  WebhookHandlerResponse
} from '../../types/webhook';

const logger = createLogger('WebhookProcessor');

export interface ProcessorOptions {
  provider: string;
  secret?: string;
  skipSignatureVerification?: boolean;
}

/**
 * Processes incoming webhook requests
 */
export class WebhookProcessor {
  /**
   * Process an incoming webhook request
   */
  async processWebhook(
    req: WebhookRequest,
    res: Response,
    options: ProcessorOptions
  ): Promise<void> {
    const { provider: providerName, secret, skipSignatureVerification } = options;

    try {
      // Get the provider
      const provider = webhookRegistry.getProvider(providerName);
      if (!provider) {
        logger.error(`Provider not found: ${providerName}`);
        res.status(404).json({ error: 'Not found' });
        return;
      }

      // Verify signature if required
      if (!skipSignatureVerification && secret) {
        const isValid = await provider.verifySignature(req, secret);
        if (!isValid) {
          logger.warn(`Invalid signature for ${providerName} webhook`);
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
      }

      // Parse the payload
      const payload = await provider.parsePayload(req);
      const eventType = provider.getEventType(payload);
      const eventDescription = provider.getEventDescription(payload);

      logger.info(
        {
          provider: providerName,
          event: eventType,
          payloadId: payload.id
        },
        `Processing webhook: ${eventDescription}`
      );

      // Create context
      const context: WebhookContext = {
        provider: providerName,
        authenticated: true,
        metadata: {
          eventType,
          payloadId: payload.id,
          timestamp: payload.timestamp
        }
      };

      // Get handlers for this event
      const handlers = webhookRegistry.getHandlers(providerName, eventType);

      if (handlers.length === 0) {
        logger.info(
          {
            provider: providerName,
            event: eventType
          },
          'No handlers registered for event'
        );
        res.status(200).json({
          message: 'Webhook received but no handlers registered',
          event: eventType
        });
        return;
      }

      // Execute handlers
      const results = await this.executeHandlers(handlers, payload, context);

      // Determine overall response
      const hasErrors = results.some(r => !r.success);
      const statusCode = hasErrors ? 207 : 200; // 207 Multi-Status for partial success

      res.status(statusCode).json({
        message: 'Webhook processed',
        event: eventType,
        handlerCount: handlers.length,
        results
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          provider: providerName
        },
        'Error processing webhook'
      );

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * Execute handlers for a webhook event
   */
  private async executeHandlers(
    handlers: Array<{
      handle: (
        payload: BaseWebhookPayload,
        context: WebhookContext
      ) => Promise<WebhookHandlerResponse>;
      canHandle?: (payload: BaseWebhookPayload, context: WebhookContext) => boolean;
    }>,
    payload: BaseWebhookPayload,
    context: WebhookContext
  ): Promise<WebhookHandlerResponse[]> {
    const results: WebhookHandlerResponse[] = [];

    for (const handler of handlers) {
      try {
        // Check if handler can handle this event
        if (handler.canHandle && !handler.canHandle(payload, context)) {
          logger.debug('Handler skipped due to canHandle check');
          continue;
        }

        // Execute handler
        const result = await handler.handle(payload, context);
        results.push(result);

        logger.info(
          {
            success: result.success,
            message: result.message
          },
          'Handler executed'
        );
      } catch (error) {
        logger.error(
          {
            err: error
          },
          'Handler execution failed'
        );

        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Handler execution failed'
        });
      }
    }

    return results;
  }
}
