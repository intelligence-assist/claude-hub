#!/usr/bin/env node

const WebhookTestHelper = require('./utils/webhookTestHelper');

async function testIssueWebhook() {
  const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:8082/api/webhooks/github';
  const secret = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret';

  const webhookHelper = new WebhookTestHelper(webhookUrl, secret);

  try {
    console.log('Testing issue opened webhook for auto-tagging...');

    const result = await webhookHelper.testIssueOpened({
      title: 'Application crashes when loading user data',
      body: 'The app consistently crashes when trying to load user profiles. This appears to be a critical bug affecting all users. Error occurs in the API endpoint.'
    });

    if (result.success) {
      console.log('✓ Webhook response status:', result.status);
      console.log('✓ Response data:', result.data);
      console.log('Issue:', result.payload.issue.title);
    } else {
      console.error('✗ Webhook test failed:');
      console.error('Status:', result.status);
      console.error('Data:', result.data);
      console.error('Error:', result.error);
    }
  } catch (error) {
    console.error('✗ Unexpected error:', error.message);
  }
}

if (require.main === module) {
  testIssueWebhook();
}

module.exports = { testIssueWebhook };
