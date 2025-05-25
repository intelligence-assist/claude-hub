const fs = require('fs');
const SignatureHelper = require('./utils/signatureHelper');

const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || 'test_secret';
const payloadPath = process.argv[2] || './test-payload.json';
const webhookUrl = process.argv[3] || 'http://localhost:3001/api/webhooks/github';

// Read the payload file
const payload = fs.readFileSync(payloadPath, 'utf8');

// Calculate the signature using the utility
const signature = SignatureHelper.createGitHubSignature(payload, webhookSecret);

console.log('X-Hub-Signature-256:', signature);
console.log('\nCommand to test the webhook:');
console.log(`curl -X POST \\
  ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-GitHub-Event: issue_comment" \\
  -H "X-Hub-Signature-256: ${signature}" \\
  -d @${payloadPath}`);
