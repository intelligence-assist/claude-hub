const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

// Configuration
const webhookSecret = '17DEE6196F8C9804EB536315536F5A44600078FDEEEA646EF2AFBFB1876F3E0F';
const payload = fs.readFileSync('./test-payload.json', 'utf8');
const url = 'https://claude.jonathanflatt.org/api/webhooks/github';

// Generate signature
const hmac = crypto.createHmac('sha256', webhookSecret);
const signature = 'sha256=' + hmac.update(payload).digest('hex');

console.log('Webhook URL:', url);
console.log('Payload:', JSON.parse(payload));
console.log('Generated signature:', signature);

// Parse URL
const urlParts = new URL(url);

// Prepare request
const options = {
  hostname: urlParts.hostname,
  port: urlParts.port || 443,
  path: urlParts.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-GitHub-Event': 'issue_comment',
    'X-Hub-Signature-256': signature,
    'Content-Length': Buffer.byteLength(payload)
  }
};

// Make request
const req = https.request(options, res => {
  console.log(`\nResponse status: ${res.statusCode}`);
  console.log('Response headers:', res.headers);

  let data = '';
  res.on('data', chunk => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response body:', data);
  });
});

req.on('error', e => {
  console.error('Request error:', e.message);
});

// Send the request
req.write(payload);
req.end();

console.log('\nSending webhook to:', url);
