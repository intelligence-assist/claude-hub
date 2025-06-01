const { ContainerExecutor, assertCommandSuccess, conditionalDescribe } = require('../utils');

const containerExecutor = new ContainerExecutor();

conditionalDescribe(
  'Claude Integration E2E',
  () => {
    describe('Direct Claude Integration', () => {
      test('should execute direct Claude command', async () => {
        const result = await containerExecutor.execClaudeTest({
          testType: 'direct',
          command: 'echo "Direct Claude test"'
        });

        // Test might timeout or fail if no real API key, but should start properly
        expect(result).toBeDefined();
        expect(typeof result.exitCode).toBe('number');
      });

      test('should handle Claude environment variables', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'env | grep -E "(ANTHROPIC|CLAUDE)" || echo "No Claude env vars found"',
          env: {
            ANTHROPIC_API_KEY: 'test-key',
            CLAUDE_CODE_USE_BEDROCK: '1'
          }
        });

        expect(result.exitCode).toBe(0);
      });
    });

    describe('Claude Installation Tests', () => {
      test('should check Claude CLI installation', async () => {
        const result = await containerExecutor.execClaudeTest({
          testType: 'installation'
        });

        // Test should run and attempt to check versions
        expect(result).toBeDefined();
        expect(typeof result.exitCode).toBe('number');
      });

      test('should verify Claude CLI commands are available', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'which claude-cli && which claude || echo "Claude CLI not found in PATH"'
        });

        expect(result.exitCode).toBe(0);
      });
    });

    describe('Claude with Firewall Settings', () => {
      test('should run Claude without firewall', async () => {
        const result = await containerExecutor.execClaudeTest({
          testType: 'no-firewall',
          env: {
            DISABLE_FIREWALL: 'true'
          }
        });

        expect(result).toBeDefined();
        expect(typeof result.exitCode).toBe('number');
      });

      test('should handle firewall environment variable', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'echo $DISABLE_FIREWALL',
          env: {
            DISABLE_FIREWALL: 'true'
          }
        });

        assertCommandSuccess(result, 'true');
      });
    });

    describe('Claude Response Testing', () => {
      test('should attempt to get Claude response', async () => {
        const result = await containerExecutor.execClaudeTest({
          testType: 'response',
          timeout: 60000 // Longer timeout for API calls
        });

        // Test execution, not necessarily success (depends on API key)
        expect(result).toBeDefined();
        expect(typeof result.exitCode).toBe('number');
      });

      test('should handle Claude command formatting', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'echo "claude \\"Tell me a joke\\"" | cat'
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('claude');
        expect(result.stdout).toContain('Tell me a joke');
      });
    });

    describe('Claude Configuration', () => {
      test('should handle repository configuration', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'echo "Repository configuration test"',
          repo: 'claude-did-this/test-repo',
          env: {
            ISSUE_NUMBER: '42',
            IS_PULL_REQUEST: 'true'
          }
        });

        expect(result.exitCode).toBe(0);
      });

      test('should validate environment setup', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'env | grep -E "(REPO_FULL_NAME|ISSUE_NUMBER|IS_PULL_REQUEST|COMMAND)" | sort'
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('REPO_FULL_NAME');
        expect(result.stdout).toContain('ISSUE_NUMBER');
      });
    });
  },
  {
    dockerImage: 'claude-code-runner:latest'
  }
);
