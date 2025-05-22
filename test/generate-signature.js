const crypto = require('crypto');
const fs = require('fs');

const webhookSecret = '17DEE6196F8C9804EB536315536F5A44600078FDEEEA646EF2AFBFB1876F3E0F'; // Same as in .env file
const payloadPath = process.argv[2] || './test-payload.json';

// Read the payload file
const payload = fs.readFileSync(payloadPath, 'utf8');

// Calculate the signature
const hmac = crypto.createHmac('sha256', webhookSecret);
const signature = 'sha256=' + hmac.update(payload).digest('hex');

console.log('X-Hub-Signature-256:', signature);
console.log('\nCommand to test the webhook:');
console.log(`curl -X POST \\
  http://localhost:3001/api/webhooks/github \\
  -H "Content-Type: application/json" \\
  -H "X-GitHub-Event: issue_comment" \\
  -H "X-Hub-Signature-256: ${signature}" \\
  -d @${payloadPath}`);