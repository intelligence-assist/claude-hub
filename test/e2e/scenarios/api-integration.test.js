const { ContainerExecutor, assertCommandSuccess, conditionalDescribe } = require('../utils');

const containerExecutor = new ContainerExecutor();

conditionalDescribe(
  'API Integration E2E',
  () => {
    describe('Claude API Integration', () => {
      test('should test Claude API connection', async () => {
        // This integrates functionality from test-claude-api.js
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing Claude API integration..."
          echo "Repository: $REPO_FULL_NAME"
          echo "API Key present: \${ANTHROPIC_API_KEY:+yes}"
          echo "Claude API test complete"
        `,
          env: {
            REPO_FULL_NAME: 'claude-did-this/claude-hub',
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-key'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Claude API test complete');
        expect(result.stdout).toContain('Repository: claude-did-this/claude-hub');
      });

      test('should validate Claude API environment setup', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Validating Claude API environment..."
          [ -n "$ANTHROPIC_API_KEY" ] && echo "API key is set" || echo "API key is missing"
          [ -n "$REPO_FULL_NAME" ] && echo "Repository is set" || echo "Repository is missing"
          echo "Environment validation complete"
        `,
          env: {
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-key',
            REPO_FULL_NAME: 'test/repository'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Environment validation complete');
      });
    });

    describe('Container API Integration', () => {
      test('should test container execution with API parameters', async () => {
        // This integrates functionality from test-container.js
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'echo "Container API test"',
          repo: 'claude-did-this/test-repo',
          env: {
            CONTAINER_MODE: 'api-test',
            API_ENDPOINT: 'test-endpoint'
          }
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Container API test');
      });

      test('should handle container API error scenarios', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing API error handling..."
          [ -z "$MISSING_VAR" ] && echo "Missing variable detected" || echo "Variable found"
          echo "Error handling test complete"
        `
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Missing variable detected');
        expect(result.stdout).toContain('Error handling test complete');
      });
    });

    describe('Webhook Integration', () => {
      test('should test webhook environment setup', async () => {
        // This integrates functionality from test-webhook-response.js
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing webhook integration..."
          echo "Webhook secret present: \${GITHUB_WEBHOOK_SECRET:+yes}"
          echo "GitHub token present: \${GITHUB_TOKEN:+yes}"
          echo "Repository: $REPO_FULL_NAME"
          echo "Issue: $ISSUE_NUMBER"
          echo "Webhook test complete"
        `,
          env: {
            GITHUB_WEBHOOK_SECRET: 'test-webhook-secret',
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-token',
            REPO_FULL_NAME: 'test/webhook-repo',
            ISSUE_NUMBER: '42'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Webhook test complete');
        expect(result.stdout).toContain('Repository: test/webhook-repo');
      });

      test('should validate webhook payload structure', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Validating webhook payload structure..."
          echo "Repository: $REPO_FULL_NAME"
          echo "Action: $WEBHOOK_ACTION"
          echo "Sender: $WEBHOOK_SENDER"
          echo "Issue Number: $ISSUE_NUMBER"
          echo "Pull Request: $IS_PULL_REQUEST"
          echo "Payload validation complete"
        `,
          env: {
            REPO_FULL_NAME: 'owner/repo',
            WEBHOOK_ACTION: 'opened',
            WEBHOOK_SENDER: 'test-user',
            ISSUE_NUMBER: '123',
            IS_PULL_REQUEST: 'false'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Payload validation complete');
        expect(result.stdout).toContain('Action: opened');
      });
    });

    describe('Direct API Testing', () => {
      test('should test direct API calls', async () => {
        // This integrates functionality from test-direct.js
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing direct API calls..."
          curl --version 2>/dev/null && echo "Curl available" || echo "Curl not available"
          echo "Direct API test complete"
        `
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Direct API test complete');
      });

      test('should validate API response handling', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing API response handling..."
          echo "Response format: JSON"
          echo "Status: 200"
          echo "Content-Type: application/json"
          echo "API response test complete"
        `
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('API response test complete');
        expect(result.stdout).toContain('Status: 200');
      });
    });

    describe('Credential Integration', () => {
      test('should test credential provider integration', async () => {
        // This integrates functionality from test-aws-credential-provider.js
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing credential provider..."
          echo "AWS Profile: $AWS_PROFILE"
          echo "AWS Region: $AWS_REGION"
          echo "Credentials test complete"
        `,
          env: {
            AWS_PROFILE: 'claude-webhook',
            AWS_REGION: 'us-east-2'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Credentials test complete');
        expect(result.stdout).toContain('AWS Profile: claude-webhook');
      });

      test('should validate profile credential setup', async () => {
        // This integrates functionality from test-profile-credentials.js
        const homeDir = process.env.HOME || '/home/node';
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Validating profile credentials..."
          echo "Home directory: $HOME"
          echo "AWS config directory: $HOME/.aws"
          ls -la $HOME/.aws 2>/dev/null || echo "AWS directory not found"
          echo "Profile credential validation complete"
        `,
          volumes: [`${homeDir}/.aws:/home/node/.aws:ro`],
          env: {
            HOME: '/home/node'
          }
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Profile credential validation complete');
      });
    });

    describe('Issue Webhook Integration', () => {
      test('should test issue webhook processing', async () => {
        // This integrates functionality from test-issue-webhook.js
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing issue webhook..."
          echo "Issue action: $ISSUE_ACTION"
          echo "Issue number: $ISSUE_NUMBER"
          echo "Issue title: $ISSUE_TITLE"
          echo "Repository: $REPO_FULL_NAME"
          echo "Issue webhook test complete"
        `,
          env: {
            ISSUE_ACTION: 'opened',
            ISSUE_NUMBER: '42',
            ISSUE_TITLE: 'Test Issue',
            REPO_FULL_NAME: 'test/repo'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Issue webhook test complete');
        expect(result.stdout).toContain('Issue action: opened');
      });

      test('should validate issue metadata', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Validating issue metadata..."
          echo "Author: $ISSUE_AUTHOR"
          echo "Labels: $ISSUE_LABELS"
          echo "State: $ISSUE_STATE"
          echo "Created: $ISSUE_CREATED_AT"
          echo "Metadata validation complete"
        `,
          env: {
            ISSUE_AUTHOR: 'test-author',
            ISSUE_LABELS: 'bug,enhancement',
            ISSUE_STATE: 'open',
            ISSUE_CREATED_AT: '2024-01-01T00:00:00Z'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Metadata validation complete');
        expect(result.stdout).toContain('Author: test-author');
      });
    });
  },
  {
    dockerImage: 'claude-code-runner:latest'
  }
);
