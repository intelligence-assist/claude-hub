#!/usr/bin/env node

/**
 * Test script to verify webhook response returns Claude's response
 * instead of posting to GitHub
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3003';

// Sample webhook payload
const payload = {
  action: 'created',
  issue: {
    number: 1,
    title: 'Test Issue',
    body: 'Test issue body'
  },
  comment: {
    id: 123,
    body: `${process.env.BOT_USERNAME || '@ClaudeBot'} Test command for webhook response`,
    user: {
      login: 'testuser'
    }
  },
  repository: {
    full_name: 'test/repo',
    name: 'repo',
    owner: {
      login: 'test'
    }
  },
  sender: {
    login: 'testuser'
  }
};

async function testWebhookResponse() {
  try {
    console.log('Sending webhook request to:', `${API_URL}/api/webhooks/github`);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const response = await axios.post(`${API_URL}/api/webhooks/github`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'issue_comment',
        'X-Hub-Signature-256': 'sha256=dummy-signature',
        'X-GitHub-Delivery': 'test-delivery-' + Date.now()
      }
    });
    
    console.log('\nResponse Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.claudeResponse) {
      console.log('\n✅ Success! Claude response received in webhook response:');
      console.log(response.data.claudeResponse);
    } else {
      console.log('\n❌ No Claude response found in webhook response');
    }
    
  } catch (error) {
    console.error('\nError:', error.response ? error.response.data : error.message);
    throw error;
  }
}

console.log('Testing webhook response with Claude response...\n');
testWebhookResponse();