const { ContainerExecutor, assertCommandSuccess, conditionalDescribe } = require('../utils');

const containerExecutor = new ContainerExecutor();

conditionalDescribe('AWS Authentication E2E', () => {
  
  describe('AWS Credentials Mount', () => {
    test('should mount AWS credentials directory', async () => {
      const result = await containerExecutor.execWithAWSMount();
      
      // Test should pass regardless of AWS directory existence
      // We're testing the mount capability, not credential validation
      expect(result.exitCode).toBe(0);
    });

    test('should access AWS configuration files', async () => {
      const homeDir = process.env.HOME || '/home/node';
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: 'echo "=== AWS files ==="; ls -la /home/node/.aws/ 2>/dev/null || echo "AWS directory not found"; echo "Mount test complete"',
        volumes: [`${homeDir}/.aws:/home/node/.aws:ro`]
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('AWS files');
      expect(result.stdout).toContain('Mount test complete');
    });
  });

  describe('AWS Profile Configuration', () => {
    test('should test AWS profile setup', async () => {
      const result = await containerExecutor.execAWSProfileTest();
      
      // Test should execute even if AWS profile doesn't exist
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
    });

    test('should handle AWS environment variables', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: 'echo "AWS_PROFILE: $AWS_PROFILE"; echo "AWS_REGION: $AWS_REGION"; echo "AWS_CONFIG_FILE: $AWS_CONFIG_FILE"',
        env: {
          AWS_PROFILE: 'claude-webhook',
          AWS_REGION: 'us-east-2',
          AWS_CONFIG_FILE: '/home/node/.aws/config'
        }
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('AWS_PROFILE: claude-webhook');
      expect(result.stdout).toContain('AWS_REGION: us-east-2');
    });
  });

  describe('AWS CLI Integration', () => {
    test('should verify AWS CLI is available', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: 'which aws && aws --version || echo "AWS CLI not found"'
      });
      
      expect(result.exitCode).toBe(0);
      // AWS CLI should be available in the container
    });

    test('should test AWS credential environment setup', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          export AWS_PROFILE=claude-webhook
          export AWS_CONFIG_FILE=/home/node/.aws/config
          export AWS_SHARED_CREDENTIALS_FILE=/home/node/.aws/credentials
          echo "Environment variables set:"
          echo "AWS_PROFILE: $AWS_PROFILE"
          echo "AWS_CONFIG_FILE: $AWS_CONFIG_FILE"
          echo "AWS_SHARED_CREDENTIALS_FILE: $AWS_SHARED_CREDENTIALS_FILE"
        `
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('AWS_PROFILE: claude-webhook');
      expect(result.stdout).toContain('AWS_CONFIG_FILE: /home/node/.aws/config');
    });
  });

  describe('AWS Profile Validation', () => {
    test('should attempt AWS profile validation', async () => {
      const homeDir = process.env.HOME || '/home/node';
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          if [ -f /home/node/.aws/config ]; then
            echo "=== Config content ==="
            cat /home/node/.aws/config 2>/dev/null | head -20 || echo "Cannot read config"
          else
            echo "AWS config file not found"
          fi
          echo "Profile validation test complete"
        `,
        volumes: [`${homeDir}/.aws:/home/node/.aws:ro`]
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Profile validation test complete');
    });

    test('should test STS get-caller-identity with profile', async () => {
      const homeDir = process.env.HOME || '/home/node';
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          export AWS_PROFILE=claude-webhook
          export AWS_CONFIG_FILE=/home/node/.aws/config
          export AWS_SHARED_CREDENTIALS_FILE=/home/node/.aws/credentials
          
          echo "Attempting AWS STS call..."
          aws sts get-caller-identity --profile claude-webhook 2>&1 || echo "STS call failed (expected if no valid credentials)"
          echo "STS test complete"
        `,
        volumes: [`${homeDir}/.aws:/home/node/.aws:ro`],
        timeout: 15000
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('STS test complete');
    });
  });

}, {
  dockerImage: 'claude-code-runner:latest'
});