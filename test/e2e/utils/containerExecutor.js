const { spawn } = require('child_process');

/**
 * Utility for executing Docker containers in E2E tests
 */
class ContainerExecutor {
  constructor() {
    this.defaultImage = 'claude-code-runner:latest';
    this.defaultTimeout = 30000; // 30 seconds
  }

  /**
   * Execute a command in a Docker container
   * @param {Object} options - Execution options
   * @param {string} options.command - Command to execute
   * @param {string} options.repo - Repository name (owner/repo)
   * @param {Object} options.env - Environment variables
   * @param {Array} options.volumes - Volume mounts
   * @param {Array} options.capabilities - Docker capabilities
   * @param {boolean} options.privileged - Run in privileged mode
   * @param {string} options.entrypoint - Custom entrypoint
   * @param {number} options.timeout - Timeout in milliseconds
   * @param {string} options.image - Docker image to use
   * @returns {Promise<Object>} - {exitCode, stdout, stderr}
   */
  async exec(options = {}) {
    const {
      command,
      repo = 'owner/test-repo',
      env = {},
      volumes = [],
      capabilities = [],
      privileged = false,
      entrypoint = null,
      timeout = this.defaultTimeout,
      image = this.defaultImage,
      interactive = false
    } = options;

    // Build Docker command
    const dockerArgs = ['run', '--rm'];

    // Add interactive flag if needed
    if (interactive) {
      dockerArgs.push('-i');
    }

    // Add environment variables
    const defaultEnv = {
      REPO_FULL_NAME: repo,
      ISSUE_NUMBER: '1',
      IS_PULL_REQUEST: 'false',
      COMMAND: command || 'echo test',
      GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'test-token'
    };

    const finalEnv = { ...defaultEnv, ...env };
    Object.entries(finalEnv).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        dockerArgs.push('-e', `${key}=${value}`);
      }
    });

    // Add volume mounts
    volumes.forEach(volume => {
      dockerArgs.push('-v', volume);
    });

    // Add capabilities
    capabilities.forEach(cap => {
      dockerArgs.push('--cap-add', cap);
    });

    // Add privileged mode
    if (privileged) {
      dockerArgs.push('--privileged');
    }

    // Add custom entrypoint
    if (entrypoint) {
      dockerArgs.push('--entrypoint', entrypoint);
    }

    // Add image
    dockerArgs.push(image);

    // Add command if entrypoint is specified
    if (entrypoint && command) {
      dockerArgs.push('-c', command);
    }

    return this._executeDockerCommand(dockerArgs, timeout);
  }

  /**
   * Execute basic container test
   */
  async execBasicContainer(options = {}) {
    return this.exec({
      entrypoint: '/bin/bash',
      command: 'echo "Container works" && ls -la /home/node/',
      ...options
    });
  }

  /**
   * Execute AWS mount test
   */
  async execWithAWSMount(options = {}) {
    const homeDir = process.env.HOME || '/home/node';
    return this.exec({
      entrypoint: '/bin/bash',
      command: 'ls -la /home/node/.aws/',
      volumes: [`${homeDir}/.aws:/home/node/.aws:ro`],
      ...options
    });
  }

  /**
   * Execute firewall test
   */
  async execFirewallTest(options = {}) {
    return this.exec({
      entrypoint: '/bin/bash',
      command:
        'whoami && /usr/local/bin/init-firewall.sh && echo "Firewall initialized successfully"',
      privileged: true,
      capabilities: [
        'NET_ADMIN',
        'NET_RAW',
        'SYS_TIME',
        'DAC_OVERRIDE',
        'AUDIT_WRITE',
        'SYS_ADMIN'
      ],
      ...options
    });
  }

  /**
   * Execute Claude command test
   */
  async execClaudeTest(options = {}) {
    const { testType = 'direct', ...restOptions } = options;

    const configs = {
      direct: {
        env: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-key'
        }
      },
      installation: {
        command: 'claude-cli --version && claude --version'
      },
      'no-firewall': {
        env: {
          DISABLE_FIREWALL: 'true'
        }
      },
      response: {
        command: 'claude "Tell me a joke"',
        env: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-key'
        }
      }
    };

    const config = configs[testType] || configs.direct;

    return this.exec({
      interactive: true,
      ...config,
      ...restOptions
    });
  }

  /**
   * Execute full flow test
   */
  async execFullFlow(options = {}) {
    const homeDir = process.env.HOME || '/home/node';
    return this.exec({
      interactive: true,
      volumes: [`${homeDir}/.aws:/home/node/.aws:ro`],
      env: {
        AWS_PROFILE: 'claude-webhook',
        AWS_REGION: 'us-east-2',
        CLAUDE_CODE_USE_BEDROCK: '1',
        ANTHROPIC_MODEL: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'dummy-token',
        ...options.env
      },
      ...options
    });
  }

  /**
   * Execute AWS profile test
   */
  async execAWSProfileTest(options = {}) {
    const homeDir = process.env.HOME || '/home/node';
    return this.exec({
      entrypoint: '/bin/bash',
      command:
        "echo '=== AWS files ==='; ls -la /home/node/.aws/; echo '=== Config content ==='; cat /home/node/.aws/config; echo '=== Test AWS profile ==='; export AWS_PROFILE=claude-webhook; export AWS_CONFIG_FILE=/home/node/.aws/config; export AWS_SHARED_CREDENTIALS_FILE=/home/node/.aws/credentials; aws sts get-caller-identity --profile claude-webhook",
      volumes: [`${homeDir}/.aws:/home/node/.aws:ro`],
      ...options
    });
  }

  /**
   * Execute the actual Docker command
   * @private
   */
  _executeDockerCommand(dockerArgs, timeout) {
    return new Promise((resolve, reject) => {
      const child = spawn('docker', dockerArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', data => {
        stdout += data.toString();
      });

      child.stderr.on('data', data => {
        stderr += data.toString();
      });

      const timeoutHandle = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Docker command timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', code => {
        clearTimeout(timeoutHandle);
        resolve({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      child.on('error', error => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }
}

module.exports = { ContainerExecutor };
