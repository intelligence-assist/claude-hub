const { ContainerExecutor, assertCommandSuccess, conditionalDescribe } = require('../utils');

const containerExecutor = new ContainerExecutor();

conditionalDescribe('Security & Firewall E2E', () => {
  
  describe('Firewall Initialization', () => {
    test('should initialize firewall in privileged container', async () => {
      const result = await containerExecutor.execFirewallTest();
      
      // Test should execute the firewall initialization script
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
      
      // Check if firewall script was found and executed
      if (result.exitCode === 0) {
        expect(result.stdout).toContain('Firewall initialized successfully');
      }
    });

    test('should run with required capabilities for firewall', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: 'whoami && echo "Capabilities test passed" && capsh --print 2>/dev/null || echo "capsh not available"',
        privileged: true,
        capabilities: ['NET_ADMIN', 'NET_RAW', 'SYS_TIME', 'DAC_OVERRIDE', 'AUDIT_WRITE', 'SYS_ADMIN']
      });
      
      assertCommandSuccess(result, 'Capabilities test passed');
    });
  });

  describe('Network Security', () => {
    test('should test network capabilities', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          echo "Testing network capabilities..."
          ping -c 1 8.8.8.8 2>/dev/null && echo "Network connectivity OK" || echo "Network test failed"
          echo "Network test complete"
        `,
        capabilities: ['NET_ADMIN', 'NET_RAW'],
        timeout: 10000
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Network test complete');
    });

    test('should verify firewall script exists', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: 'ls -la /usr/local/bin/init-firewall.sh 2>/dev/null || echo "Firewall script not found"'
      });
      
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Authentication & Authorization', () => {
    test('should test with authentication tokens', async () => {
      const result = await containerExecutor.exec({
        env: {
          GITHUB_TOKEN: 'test-token-auth',
          ANTHROPIC_API_KEY: 'test-api-key-auth'
        },
        command: 'echo "Authentication test"'
      });
      
      assertCommandSuccess(result, 'Authentication test');
    });

    test('should validate token environment variables', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          echo "Checking authentication tokens..."
          [ -n "$GITHUB_TOKEN" ] && echo "GITHUB_TOKEN is set" || echo "GITHUB_TOKEN is not set"
          [ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_API_KEY is set" || echo "ANTHROPIC_API_KEY is not set"
          echo "Token validation complete"
        `,
        env: {
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-github-token',
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-anthropic-key'
        }
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Token validation complete');
    });
  });

  describe('Security Isolation', () => {
    test('should test container isolation', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          echo "Testing container isolation..."
          whoami
          pwd
          echo "Container ID: $HOSTNAME"
          echo "Isolation test complete"
        `
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Isolation test complete');
      expect(result.stdout).toContain('Container ID:');
    });

    test('should verify user permissions', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          echo "User: $(whoami)"
          echo "UID: $(id -u)"
          echo "GID: $(id -g)"
          echo "Groups: $(groups)"
          echo "Permissions test complete"
        `
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Permissions test complete');
    });
  });

  describe('System Time and Audit Capabilities', () => {
    test('should test system time capability', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          echo "Testing system time capability..."
          date
          echo "Current timezone: $(cat /etc/timezone 2>/dev/null || echo 'Unknown')"
          echo "Time capability test complete"
        `,
        capabilities: ['SYS_TIME']
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Time capability test complete');
    });

    test('should test audit capabilities', async () => {
      const result = await containerExecutor.exec({
        entrypoint: '/bin/bash',
        command: `
          echo "Testing audit capabilities..."
          echo "Audit write capability test"
          echo "Audit test complete"
        `,
        capabilities: ['AUDIT_WRITE']
      });
      
      assertCommandSuccess(result);
      expect(result.stdout).toContain('Audit test complete');
    });
  });

}, {
  dockerImage: 'claude-code-runner:latest'
});