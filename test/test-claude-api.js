const axios = require('axios');
require('dotenv').config();

// Configuration
const apiUrl = process.env.API_URL || 'http://localhost:3003/api/webhooks/claude';
const authToken = process.env.CLAUDE_WEBHOOK_SECRET || process.env.CLAUDE_API_AUTH_TOKEN;
const repoFullName = process.argv[2] || 'test-org/test-repo';
const asyncMode = process.argv[3] === 'async';

// The command to send to Claude
const command = process.argv[4] || 'Explain what this repository does and list its main components';

console.log(`
Claude Webhook API Test Utility
==============================
API URL:     ${apiUrl}
Repository:  ${repoFullName}
Mode:        ${asyncMode ? 'Async (session)' : 'Sync'}
Auth Token:  ${authToken ? '[REDACTED]' : 'Not provided'}
Command:     "${command}"
`);

// Send the request to the Claude webhook API
async function testClaudeWebhook() {
  try {
    if (asyncMode) {
      // Create a session
      console.log('Creating Claude session...');

      const createPayload = {
        type: 'session.create',
        session: {
          type: 'implementation',
          project: {
            repository: repoFullName,
            requirements: command
          }
        }
      };

      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      console.time('Session creation time');
      const createResponse = await axios.post(apiUrl, createPayload, { headers });
      console.timeEnd('Session creation time');

      console.log('\nSession Created:', JSON.stringify(createResponse.data, null, 2));

      if (createResponse.data.success && createResponse.data.session) {
        const sessionId = createResponse.data.session.id;
        console.log(`\nSession ID: ${sessionId}`);
        console.log('Use the following command to check status:');
        console.log(`node test/test-claude-api.js status ${sessionId}`);
      }
    } else if (process.argv[2] === 'status' && process.argv[3]) {
      // Check session status
      const sessionId = process.argv[3];
      console.log(`Checking status for session: ${sessionId}`);

      const statusPayload = {
        type: 'session.get',
        sessionId
      };

      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      const statusResponse = await axios.post(apiUrl, statusPayload, { headers });
      console.log('\nSession Status:', JSON.stringify(statusResponse.data, null, 2));
    } else {
      console.error('Synchronous mode is no longer supported.');
      console.error('Please use async mode: node test/test-claude-api.js <repo> async "<command>"');
      console.error('Or check session status: node test/test-claude-api.js status <sessionId>');
    }
  } catch (error) {
    console.error('Error calling Claude webhook API:', error.message);

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

// Run the test
testClaudeWebhook();
