const http = require('http');
// const { promisify } = require('util');
const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');

// Configuration
const port = 3002; // Different from the main server
const webhookSecret = 'testing_webhook_secret';
const testPayloadPath = './test-payload.json';
const mainServerUrl = 'http://localhost:3001/api/webhooks/github';

// Create a simple webhook receiving server
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST') {
    console.log('Received webhook request');
    console.log('Headers:', req.headers);
    
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      console.log('Webhook Payload:', body);
      
      // Verify signature if sent
      if (req.headers['x-hub-signature-256']) {
        const hmac = crypto.createHmac('sha256', webhookSecret);
        const signature = 'sha256=' + hmac.update(body).digest('hex');
        console.log('Expected signature:', signature);
        console.log('Received signature:', req.headers['x-hub-signature-256']);
        
        if (signature === req.headers['x-hub-signature-256']) {
          console.log('✅ Signature verification passed');
        } else {
          console.log('❌ Signature verification failed');
        }
      }
      
      // Send response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'success', 
        message: 'Webhook received successfully',
        timestamp: new Date().toISOString()
      }));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Start the server
server.listen(port, async () => {
  console.log(`Test webhook receiver listening on port ${port}`);
  
  try {
    // Read the test payload
    const payload = fs.readFileSync(testPayloadPath, 'utf8');
    
    // Calculate the signature for GitHub webhook
    const hmac = crypto.createHmac('sha256', webhookSecret);
    const signature = 'sha256=' + hmac.update(payload).digest('hex');
    
    console.log('Test setup:');
    console.log('- Webhook receiver is running on port', port);
    console.log('- Will send test payload to main server at', mainServerUrl);
    console.log('- Signature calculated for GitHub webhook:', signature);
    
    console.log('\nMake sure your .env file contains:');
    console.log('GITHUB_WEBHOOK_SECRET=testing_webhook_secret');
    console.log('OUTGOING_WEBHOOK_SECRET=testing_webhook_secret');
    console.log(`OUTGOING_WEBHOOK_URLS=http://localhost:${port},https://claude.jonathanflatt.org/webhook`);
    console.log('COMMENT_WEBHOOK_URLS=https://claude.jonathanflatt.org/comment-webhook');
    
    console.log('\nYou can now manually test the webhook by running:');
    console.log(`curl -X POST \\
  ${mainServerUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-GitHub-Event: issue_comment" \\
  -H "X-Hub-Signature-256: ${signature}" \\
  -d @${testPayloadPath}`);
    
    console.log('\nOr press Enter to send the test webhook automatically...');
    
    // Wait for user input
    process.stdin.once('data', async () => {
      try {
        console.log('\nSending test webhook to main server...');
        
        // Send the webhook
        const response = await axios.post(
          mainServerUrl,
          JSON.parse(payload),
          {
            headers: {
              'Content-Type': 'application/json',
              'X-GitHub-Event': 'issue_comment',
              'X-Hub-Signature-256': signature
            }
          }
        );
        
        console.log(`Main server response (${response.status}):`, response.data);
        console.log('\nIf everything is set up correctly, you should see a webhook received above ☝️');
        console.log('\nPress Ctrl+C to exit');
      } catch (error) {
        console.error('Error sending test webhook:', error.message);
        if (error.response) {
          console.error('Response data:', error.response.data);
        }
      }
    });
  } catch (error) {
    console.error('Error in test setup:', error.message);
  }
});