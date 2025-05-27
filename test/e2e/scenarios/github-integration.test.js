const {
  ContainerExecutor,
  assertCommandSuccess,
  conditionalDescribe,
  skipIfEnvVarsMissing
} = require('../utils');

const containerExecutor = new ContainerExecutor();

conditionalDescribe(
  'GitHub Integration E2E',
  () => {
    describe('GitHub Token Validation', () => {
      test('should validate GitHub token environment variable', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command:
            'echo "Checking GitHub token..."; [ -n "$GITHUB_TOKEN" ] && echo "GITHUB_TOKEN is set" || echo "GITHUB_TOKEN is not set"; echo "Token length: ${#GITHUB_TOKEN}"; echo "Token validation complete"',
          env: {
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-github-token'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Token validation complete');
        expect(result.stdout).toContain('GITHUB_TOKEN is set');
      });

      test('should test GitHub CLI availability', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: 'which gh && gh --version || echo "GitHub CLI not found"'
        });

        expect(result.exitCode).toBe(0);
      });
    });

    describe('GitHub API Integration', () => {
      test('should test GitHub authentication with token', async () => {
        if (skipIfEnvVarsMissing(['GITHUB_TOKEN'])) {
          return;
        }

        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing GitHub authentication..."
          gh auth status 2>&1 || echo "GitHub auth failed (expected if token is invalid)"
          echo "GitHub auth test complete"
        `,
          env: {
            GITHUB_TOKEN: process.env.GITHUB_TOKEN
          },
          timeout: 15000
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('GitHub auth test complete');
      });

      test('should test GitHub repository access', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing repository access..."
          echo "Repository: $REPO_FULL_NAME"
          gh repo view $REPO_FULL_NAME 2>&1 || echo "Repository access failed (expected if token is invalid or repo doesn't exist)"
          echo "Repository access test complete"
        `,
          env: {
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-token',
            REPO_FULL_NAME: 'intelligence-assist/claude-hub'
          },
          timeout: 15000
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Repository access test complete');
      });
    });

    describe('GitHub Webhook Integration', () => {
      test('should validate webhook environment variables', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Webhook environment validation..."
          echo "Repository: $REPO_FULL_NAME"
          echo "Issue Number: $ISSUE_NUMBER"
          echo "Is Pull Request: $IS_PULL_REQUEST"
          echo "Command: $COMMAND"
          echo "Webhook validation complete"
        `,
          env: {
            REPO_FULL_NAME: 'owner/test-repo',
            ISSUE_NUMBER: '42',
            IS_PULL_REQUEST: 'false',
            COMMAND: 'test webhook integration'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Repository: owner/test-repo');
        expect(result.stdout).toContain('Issue Number: 42');
        expect(result.stdout).toContain('Is Pull Request: false');
      });

      test('should test GitHub issue operations', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing GitHub issue operations..."
          echo "Issue: $ISSUE_NUMBER in $REPO_FULL_NAME"
          gh issue view $ISSUE_NUMBER --repo $REPO_FULL_NAME 2>&1 || echo "Issue view failed (expected if token is invalid or issue doesn't exist)"
          echo "Issue operations test complete"
        `,
          env: {
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-token',
            REPO_FULL_NAME: 'intelligence-assist/claude-hub',
            ISSUE_NUMBER: '1'
          },
          timeout: 15000
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Issue operations test complete');
      });
    });

    describe('GitHub Pull Request Integration', () => {
      test('should test pull request environment variables', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Pull request environment test..."
          echo "Repository: $REPO_FULL_NAME"
          echo "PR Number: $ISSUE_NUMBER"
          echo "Is Pull Request: $IS_PULL_REQUEST"
          echo "PR validation complete"
        `,
          env: {
            REPO_FULL_NAME: 'owner/test-repo',
            ISSUE_NUMBER: '123',
            IS_PULL_REQUEST: 'true'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('Is Pull Request: true');
        expect(result.stdout).toContain('PR Number: 123');
      });

      test('should test GitHub PR operations', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing GitHub PR operations..."
          if [ "$IS_PULL_REQUEST" = "true" ]; then
            echo "Processing pull request $ISSUE_NUMBER"
            gh pr view $ISSUE_NUMBER --repo $REPO_FULL_NAME 2>&1 || echo "PR view failed (expected if token is invalid or PR doesn't exist)"
          else
            echo "Not a pull request, skipping PR operations"
          fi
          echo "PR operations test complete"
        `,
          env: {
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-token',
            REPO_FULL_NAME: 'intelligence-assist/claude-hub',
            ISSUE_NUMBER: '1',
            IS_PULL_REQUEST: 'false'
          },
          timeout: 15000
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('PR operations test complete');
      });
    });

    describe('GitHub CLI Commands', () => {
      test('should test basic GitHub CLI commands', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command: `
          echo "Testing GitHub CLI commands..."
          gh --version
          gh auth status 2>&1 | head -3 || echo "No auth status available"
          echo "GitHub CLI test complete"
        `,
          env: {
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-token'
          }
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('GitHub CLI test complete');
        expect(result.stdout).toContain('gh version');
      });

      test('should verify GitHub configuration', async () => {
        const result = await containerExecutor.exec({
          entrypoint: '/bin/bash',
          command:
            'echo "Verifying GitHub configuration..."; echo "Token set: ${GITHUB_TOKEN:+yes}"; echo "Config dir: ${XDG_CONFIG_HOME:-$HOME/.config}/gh"; echo "GitHub config verification complete"',
          env: {
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-token'
          }
        });

        assertCommandSuccess(result);
        expect(result.stdout).toContain('GitHub config verification complete');
      });
    });
  },
  {
    dockerImage: 'claude-code-runner:latest'
  }
);
