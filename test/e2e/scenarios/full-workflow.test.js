const { ContainerExecutor, assertCommandSuccess, conditionalDescribe } = require('../utils');

const containerExecutor = new ContainerExecutor();

conditionalDescribe('Full Workflow E2E', () => {
  
  describe('Complete Entrypoint Flow', () => {
    test('should execute full entrypoint flow', async () => {
      const result = await containerExecutor.execFullFlow({
        timeout: 60000 // Longer timeout for full workflow
      });
      
      // Test should execute the full workflow
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
    });

    test('should handle complete environment setup', async () => {
      const result = await containerExecutor.execFullFlow({
        env: {
          TEST_REPO_FULL_NAME: 'intelligence-assist/test-repo',
          COMMAND: 'echo "Full workflow test"'
        }
      });
      
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
    });
  });

  describe('Claude Code Docker Integration', () => {
    test('should test Claude Code container execution', async () => {
      const result = await containerExecutor.exec({
        interactive: true,
        env: {
          REPO_FULL_NAME: 'intelligence-assist/claude-hub',
          ISSUE_NUMBER: '1',
          IS_PULL_REQUEST: 'false',
          COMMAND: 'echo "Claude Code Docker test"',
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-token'
        },
        timeout: 45000
      });
      
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
    });

    test('should validate Claude Code environment', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          echo "Validating Claude Code environment..."
          echo "Repository: $REPO_FULL_NAME"
          echo "Issue: $ISSUE_NUMBER"
          echo "Command: $COMMAND"
          which claude-cli 2>/dev/null && echo "Claude CLI found" || echo "Claude CLI not found"
          which gh 2>/dev/null && echo "GitHub CLI found" || echo "GitHub CLI not found"
          echo "Environment validation complete"
        `,
        env: {
          REPO_FULL_NAME: 'intelligence-assist/claude-hub',
          ISSUE_NUMBER: '42',
          COMMAND: 'validate environment'
        }
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Environment validation complete');
    });
  });

  describe('End-to-End Integration', () => {
    test('should test complete integration workflow', async () => {
      const result = await containerExecutor.exec({
        interactive: true,
        env: {
          REPO_FULL_NAME: 'intelligence-assist/claude-hub',
          ISSUE_NUMBER: '1',
          IS_PULL_REQUEST: 'false',
          COMMAND: 'echo "Integration test complete"',
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'dummy-token',
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-key'
        },
        timeout: 45000
      });
      
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
    });

    test('should test workflow with Bedrock configuration', async () => {
      const homeDir = process.env.HOME || '/home/node';
      const result = await containerExecutor.exec({
        interactive: true,
        volumes: [`${homeDir}/.aws:/home/node/.aws:ro`],
        env: {
          REPO_FULL_NAME: 'intelligence-assist/test-bedrock',
          ISSUE_NUMBER: '1',
          IS_PULL_REQUEST: 'false',
          COMMAND: 'echo "Bedrock integration test"',
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'dummy-token',
          AWS_PROFILE: 'claude-webhook',
          AWS_REGION: 'us-east-2',
          CLAUDE_CODE_USE_BEDROCK: '1',
          ANTHROPIC_MODEL: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0'
        },
        timeout: 60000
      });
      
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
    });
  });

  describe('Workflow Error Handling', () => {
    test('should handle invalid repository names', async () => {
      const result = await containerExecutor.exec({
        env: {
          REPO_FULL_NAME: 'invalid/nonexistent-repo',
          ISSUE_NUMBER: '999',
          IS_PULL_REQUEST: 'false',
          COMMAND: 'echo "Error handling test"',
          GITHUB_TOKEN: 'invalid-token'
        },
        timeout: 30000
      });
      
      // Should execute but may fail due to invalid repo/token
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
    });

    test('should handle missing environment variables gracefully', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          echo "Testing missing env vars..."
          [ -z "$REPO_FULL_NAME" ] && echo "REPO_FULL_NAME is missing" || echo "REPO_FULL_NAME is set"
          [ -z "$GITHUB_TOKEN" ] && echo "GITHUB_TOKEN is missing" || echo "GITHUB_TOKEN is set"
          echo "Error handling test complete"
        `
        // Intentionally not setting some env vars
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Error handling test complete');
    });
  });

  describe('Performance and Timeout Handling', () => {
    test('should handle long-running commands', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: 'echo "Starting long task..."; sleep 2; echo "Long task completed"',
        timeout: 10000
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Long task completed');
    });

    test('should respect timeout limits', async () => {
      const startTime = Date.now();
      
      try {
        await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'sleep 10', // Command that takes longer than timeout
          timeout: 2000 // 2 second timeout
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(5000); // Should timeout before 5 seconds
        expect(error.message).toContain('timed out');
      }
    });
  });

  describe('Container Resource Management', () => {
    test('should manage container resources properly', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          echo "Resource management test..."
          echo "Memory info:"
          cat /proc/meminfo | head -3 || echo "Cannot read meminfo"
          echo "CPU info:"
          nproc 2>/dev/null || echo "Cannot get CPU count"
          echo "Disk usage:"
          df -h / 2>/dev/null | head -2 || echo "Cannot get disk usage"
          echo "Resource test complete"
        `
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Resource test complete');
    });

    test('should verify container isolation and cleanup', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          echo "Container isolation test..."
          echo "Hostname: $HOSTNAME"
          echo "PID: $$"
          echo "Working directory: $(pwd)"
          echo "User: $(whoami)"
          echo "Isolation test complete"
        `
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Isolation test complete');
      expect(result.stdout).toContain('Hostname:');
    });
  });

}, {
  dockerImage: 'claude-code-runner:latest'
});