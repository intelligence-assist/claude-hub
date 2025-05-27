#!/usr/bin/env node

/**
 * Debug script to log detailed information about check_suite webhooks
 * This helps diagnose why PR reviews might not be triggering
 */

// Set required environment variables
process.env.BOT_USERNAME = process.env.BOT_USERNAME || '@TestBot';
process.env.NODE_ENV = 'development';
process.env.GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret';
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'test-token';

const express = require('express');
const bodyParser = require('body-parser');
const { createLogger } = require('../src/utils/logger');

const logger = createLogger('debug-check-suite');
const app = express();
const PORT = process.env.PORT || 3333;

// Middleware to capture raw body for signature verification
app.use(bodyParser.raw({ type: 'application/json' }));
app.use((req, res, next) => {
  req.rawBody = req.body;
  req.body = JSON.parse(req.body.toString());
  next();
});

// Debug webhook endpoint
app.post('/webhook', (req, res) => {
  const event = req.headers['x-github-event'];
  const delivery = req.headers['x-github-delivery'];

  logger.info(
    {
      event,
      delivery,
      headers: req.headers
    },
    'Received webhook'
  );

  if (event === 'check_suite') {
    const payload = req.body;
    const checkSuite = payload.check_suite;
    const repo = payload.repository;

    logger.info(
      {
        action: payload.action,
        repo: repo?.full_name,
        checkSuite: {
          id: checkSuite?.id,
          conclusion: checkSuite?.conclusion,
          status: checkSuite?.status,
          head_branch: checkSuite?.head_branch,
          head_sha: checkSuite?.head_sha,
          before: checkSuite?.before,
          after: checkSuite?.after,
          pull_requests_count: checkSuite?.pull_requests?.length || 0,
          pull_requests: checkSuite?.pull_requests?.map(pr => ({
            number: pr.number,
            id: pr.id,
            url: pr.url,
            head: pr.head,
            base: pr.base
          }))
        }
      },
      'CHECK_SUITE webhook details'
    );

    // Log the full payload for deep inspection
    logger.debug(
      {
        fullPayload: JSON.stringify(payload, null, 2)
      },
      'Full webhook payload'
    );
  }

  res.status(200).json({ message: 'Webhook logged' });
});

// Start server
app.listen(PORT, () => {
  logger.info({ port: PORT }, `Debug webhook server listening on port ${PORT}`);
  console.log('\nTo test this webhook receiver:');
  console.log(`1. Configure your GitHub webhook to point to: http://YOUR_SERVER:${PORT}/webhook`);
  console.log('2. Make sure to include check_suite events in the webhook configuration');
  console.log('3. Trigger a check suite completion in your repository');
  console.log('4. Check the logs above for detailed information\n');
});
