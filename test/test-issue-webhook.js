#!/usr/bin/env node

const axios = require('axios');
const crypto = require('crypto');

// Mock GitHub issue opened event payload
const mockPayload = {
  action: 'opened',
  issue: {
    number: 123,
    title: 'Application crashes when loading user data',
    body: 'The app consistently crashes when trying to load user profiles. This appears to be a critical bug affecting all users. Error occurs in the API endpoint.',
    user: {
      login: 'testuser'
    }
  },
  repository: {
    name: 'test-repo',
    full_name: 'testowner/test-repo',
    owner: {
      login: 'testowner'
    }
  }
};

// Function to create GitHub webhook signature
function createSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return `sha256=${hmac.digest('hex')}`;
}

async function testIssueWebhook() {
  const webhookUrl = 'http://localhost:8082/api/webhooks/github';
  const secret = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret';

  try {
    console.log('Testing issue webhook with mock payload...');
    console.log('Issue:', mockPayload.issue.title);

    const signature = createSignature(mockPayload, secret);

    const response = await axios.post(webhookUrl, mockPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'issues',
        'X-GitHub-Delivery': 'test-delivery-id',
        'X-Hub-Signature-256': signature,
        'User-Agent': 'GitHub-Hookshot/test'
      },
      timeout: 30000
    });

    console.log('✓ Webhook response status:', response.status);
    console.log('✓ Response data:', response.data);
  } catch (error) {
    console.error('✗ Webhook test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

if (require.main === module) {
  testIssueWebhook();
}

module.exports = { testIssueWebhook, mockPayload };
