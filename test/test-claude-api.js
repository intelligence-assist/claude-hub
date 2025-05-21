const axios = require('axios');
require('dotenv').config();

// Configuration
const apiUrl = process.env.API_URL || 'http://localhost:3003/api/claude';
const authToken = process.env.CLAUDE_API_AUTH_TOKEN;
const repoFullName = process.argv[2] || 'test-org/test-repo';
const useContainer = process.argv[3] === 'container';

// The command to send to Claude
const command = process.argv[4] || 'Explain what this repository does and list its main components';

console.log(`
Claude API Test Utility
=======================
API URL:     ${apiUrl}
Repository:  ${repoFullName}
Container:   ${useContainer ? 'Yes' : 'No'}
Auth Token:  ${authToken ? '[REDACTED]' : 'Not provided'}
Command:     "${command}"
`);

// Send the request to the Claude API
async function testClaudeApi() {
  try {
    console.log('Sending request to Claude API...');
    
    const payload = {
      repoFullName,
      command,
      useContainer
    };
    
    if (authToken) {
      payload.authToken = authToken;
    }

    console.time('Claude processing time');
    const response = await axios.post(apiUrl, payload);
    console.timeEnd('Claude processing time');

    console.log('\nResponse Status:', response.status);
    console.log('Full Response Data:', JSON.stringify(response.data, null, 2));
    console.log('\n--- Claude Response ---\n');
    console.log(response.data.response || 'No response received');
    console.log('\n--- End Response ---\n');
  } catch (error) {
    console.error('Error calling Claude API:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

// Run the test
testClaudeApi();