#!/usr/bin/env node

/**
 * CLI tool to call the GitHub webhook endpoint
 * Usage: ./webhook-cli.js --repo owner/repo --command "your command" [options]
 */

const axios = require('axios');
const crypto = require('crypto');
const { Command } = require('commander');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('webhook-cli')
  .description('CLI to call the Claude GitHub webhook endpoint')
  .version('1.0.0')
  .requiredOption('-r, --repo <repo>', 'GitHub repository (format: owner/repo or repo)')
  .requiredOption('-c, --command <command>', 'Command to send to Claude')
  .option('-i, --issue <number>', 'Issue number', '1')
  .option('-p, --pr', 'Treat as pull request instead of issue')
  .option('-b, --branch <branch>', 'Branch name for PR (only used with --pr)')
  .option('-u, --url <url>', 'API URL', process.env.API_URL || 'http://localhost:3003')
  .option('-s, --secret <secret>', 'Webhook secret', process.env.GITHUB_WEBHOOK_SECRET)
  .option('-t, --token <token>', 'GitHub token', process.env.GITHUB_TOKEN)
  .option('-v, --verbose', 'Verbose output')
  .parse(process.argv);

const options = program.opts();

// Handle repo format - if no owner specified, use default from env
let owner, repo;
if (options.repo.includes('/')) {
  [owner, repo] = options.repo.split('/');
} else {
  owner = process.env.DEFAULT_GITHUB_OWNER || 'default-owner';
  repo = options.repo;
}

const fullRepoName = `${owner}/${repo}`;

// Create webhook payload
const payload = {
  action: 'created',
  repository: {
    full_name: fullRepoName,
    name: repo,
    owner: {
      login: owner
    }
  },
  sender: {
    login: process.env.DEFAULT_GITHUB_USER || owner
  }
};

// Add issue or PR specific payload
if (options.pr) {
  payload.pull_request = {
    number: parseInt(options.issue),
    body: `@${process.env.BOT_USERNAME || 'ClaudeBot'} ${options.command}`,
    user: {
      login: process.env.DEFAULT_GITHUB_USER || owner
    },
    head: {
      ref: options.branch || process.env.DEFAULT_BRANCH || 'main'
    }
  };
} else {
  payload.issue = {
    number: parseInt(options.issue),
    title: 'CLI Request',
    body: 'Request from CLI'
  };
  payload.comment = {
    id: Date.now(),
    body: `@${process.env.BOT_USERNAME || 'ClaudeBot'} ${options.command}`,
    user: {
      login: process.env.DEFAULT_GITHUB_USER || owner
    }
  };
}

// Calculate webhook signature if secret is provided
function calculateSignature(payload, secret) {
  const body = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(body).digest('hex');
}

// Make the request
async function sendWebhook() {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-GitHub-Event': options.pr ? 'pull_request' : 'issue_comment',
      'X-GitHub-Delivery': 'cli-delivery-' + Date.now()
    };

    // Add signature if secret is provided
    if (options.secret) {
      headers['X-Hub-Signature-256'] = calculateSignature(payload, options.secret);
    }

    const url = `${options.url}/api/webhooks/github`;
    
    if (options.verbose) {
      console.log('Sending request to:', url);
      console.log('Headers:', JSON.stringify(headers, null, 2));
      console.log('Payload:', JSON.stringify(payload, null, 2));
    }

    const response = await axios.post(url, payload, { headers });

    console.log('\n✅ Success!');
    console.log('Status:', response.status);
    
    if (response.data.claudeResponse) {
      console.log('\n📝 Claude Response:');
      console.log('-'.repeat(50));
      console.log(response.data.claudeResponse);
      console.log('-'.repeat(50));
    }
    
    if (response.data.context) {
      console.log('\n📍 Context:');
      console.log(JSON.stringify(response.data.context, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Error:', error.response ? error.response.data : error.message);
    
    if (error.response && options.verbose) {
      console.error('Full error response:', error.response.data);
    }
    
    process.exit(1);
  }
}

// Run the CLI
console.log(`🚀 Sending command to Claude for ${fullRepoName}...`);
console.log(`📋 Command: ${options.command}`);
console.log(`${options.pr ? '🔀 Type: Pull Request' : '📄 Type: Issue'}`);
console.log();

sendWebhook();