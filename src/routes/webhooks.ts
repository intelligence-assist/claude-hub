import { Router } from 'express';
import { WebhookProcessor } from '../core/webhook/WebhookProcessor';
import { webhookRegistry } from '../core/webhook/WebhookRegistry';
import { isAllowedProvider } from '../core/webhook/constants';
import { createLogger } from '../utils/logger';
import secureCredentials from '../utils/secureCredentials';
// Import providers to trigger auto-initialization
import '../providers/github';

const logger = createLogger('webhookRoutes');
const router = Router();
const processor = new WebhookProcessor();

/**
 * Generic webhook endpoint
 * POST /api/webhooks/:provider
 */
router.post('/:provider', async (req, res) => {
  const providerName = req.params.provider;

  // Validate provider name against whitelist
  if (!isAllowedProvider(providerName)) {
    logger.warn(`Invalid webhook provider requested: ${providerName}`);
    res.status(404).json({ error: 'Not found' });
    return;
  }

  logger.info(
    {
      provider: providerName,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      }
    },
    `Received webhook request for provider: ${providerName}`
  );

  // Get provider-specific secret
  const secretKey = `${providerName.toUpperCase()}_WEBHOOK_SECRET`;
  const secret = secureCredentials.get(secretKey);

  if (!secret) {
    logger.warn(`No webhook secret configured for provider: ${providerName}`);
  }

  // Determine if signature verification should be skipped
  const skipSignatureVerification =
    process.env.NODE_ENV === 'test' || process.env.SKIP_WEBHOOK_VERIFICATION === '1';

  // In production, signature verification is mandatory
  if (process.env.NODE_ENV === 'production' && (!secret || skipSignatureVerification)) {
    logger.error('Webhook signature verification is mandatory in production');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Process the webhook
  await processor.processWebhook(req, res, {
    provider: providerName,
    secret: secret ?? undefined,
    skipSignatureVerification
  });
});

/**
 * Health check endpoint
 * GET /api/webhooks/health
 */
router.get('/health', (_req, res) => {
  const providers = webhookRegistry.getAllProviders();

  res.json({
    status: 'healthy',
    providers: providers.map(p => ({
      name: p.name,
      handlerCount: webhookRegistry.getHandlerCount(p.name)
    }))
  });
});

/**
 * Legacy GitHub webhook endpoint (for backward compatibility)
 * POST /api/webhooks/github
 *
 * This is handled by the generic endpoint above, but we'll keep
 * this documentation for clarity
 */

export default router;
