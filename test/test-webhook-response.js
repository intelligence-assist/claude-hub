#!/usr/bin/env node

/**
 * Test script to verify webhook response returns Claude's response
 * instead of posting to GitHub
 */

const WebhookTestHelper = require('./utils/webhookTestHelper');

const API_URL = process.env.API_URL || 'http://localhost:3003';
const secret = process.env.GITHUB_WEBHOOK_SECRET || 'test_secret';

async function testWebhookResponse() {
  const webhookHelper = new WebhookTestHelper(`${API_URL}/api/webhooks/github`, secret);

  try {
    console.log('Testing webhook response with Claude response...\n');
    console.log('Sending webhook request to:', `${API_URL}/api/webhooks/github`);

    const result = await webhookHelper.testIssueComment({
      commentBody: `${process.env.BOT_USERNAME || '@ClaudeBot'} Test command for webhook response`,
      repoOwner: 'test',
      repoName: 'repo',
      issueNumber: 1,
      userLogin: 'testuser'
    });

    console.log('Payload:', JSON.stringify(result.payload, null, 2));
    console.log('\nResponse Status:', result.status);
    console.log('Response Data:', JSON.stringify(result.data, null, 2));

    if (result.success && result.data.claudeResponse) {
      console.log('\n✅ Success! Claude response received in webhook response:');
      console.log(result.data.claudeResponse);
    } else if (result.success) {
      console.log('\n❌ No Claude response found in webhook response');
    } else {
      console.log('\n❌ Webhook request failed:');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('\nUnexpected error:', error.message);
    throw error;
  }
}

testWebhookResponse();
