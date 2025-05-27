/**
 * Enhanced test script to verify logger credential redaction
 * This is the main test for backwards compatibility
 */

const { createLogger } = require('../src/utils/logger');

// Create a test logger
const logger = createLogger('test-redaction');

console.log('Testing enhanced logger redaction...\n');

// Test various scenarios with enhanced coverage
const testData = {
  // Direct sensitive fields - expanded
  GITHUB_TOKEN: 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyz',
  GH_TOKEN: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
  AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  AWS_SESSION_TOKEN: 'AQoDYXdzEJr...<remainder of security token>',
  ANTHROPIC_API_KEY: 'sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz',
  GITHUB_WEBHOOK_SECRET: 'webhook-secret-example-123',

  // Nested in envVars - expanded
  envVars: {
    GITHUB_TOKEN: 'github_token_example_nested',
    AWS_ACCESS_KEY_ID: 'AKIAI44QH8DHBEXAMPLE',
    AWS_SECRET_ACCESS_KEY: 'nested-secret-key-example',
    ANTHROPIC_API_KEY: 'sk-ant-nested-key-example',
    DATABASE_URL: 'postgresql://user:password@host:port/database',
    JWT_SECRET: 'jwt-signing-secret'
  },

  // Nested in env object
  env: {
    GITHUB_TOKEN: 'env-github-token',
    AWS_SECRET_ACCESS_KEY: 'env-aws-secret',
    REDIS_PASSWORD: 'env-redis-password'
  },

  // Docker command with multiple secrets
  dockerCommand:
    'docker run -e GITHUB_TOKEN="github_pat_command_example" -e AWS_SECRET_ACCESS_KEY="secretInCommand" -e ANTHROPIC_API_KEY="sk-ant-command-key"',

  // Docker args array
  dockerArgs: [
    'run',
    '-e',
    'GITHUB_TOKEN=ghp_array_token',
    '-e',
    'AWS_SECRET_ACCESS_KEY=array_secret_key'
  ],

  // Error outputs with more patterns
  stderr:
    'Error: Failed with token github_pat_stderr_example and key AKIAI44QH8DHBEXAMPLE and secret wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  stdout: 'Output contains secret EXAMPLE_OUTPUT_SECRET_KEY and API key sk-ant-stdout-key',
  output: 'Command output with password=secret123 and apiKey=leaked-key',

  // HTTP headers
  headers: {
    authorization: 'Bearer secret-auth-token',
    'x-api-key': 'secret-header-api-key',
    'x-github-token': 'ghp_header_token'
  },

  // Authentication objects
  auth: {
    token: 'auth-object-token',
    secret: 'auth-object-secret',
    password: 'auth-object-password'
  },

  // Generic sensitive fields
  password: 'user-password-123',
  secret: 'generic-secret-value',
  privateKey: 'private-key-content',
  apiKey: 'api-key-secret',
  credential: 'user-credential',

  // Other fields that should pass through
  normalField: 'This is normal data',
  repo: 'owner/repo',
  issueNumber: 123,
  username: 'testuser',
  email: 'test@example.com',
  publicConfig: {
    debug: true,
    timeout: 5000,
    retries: 3
  }
};

// Log the test data
logger.info(testData, 'Testing enhanced logger redaction');

// Test nested error objects with comprehensive scenarios
logger.error(
  {
    error: {
      message: 'Authentication failed with token github_pat_error_example',
      dockerCommand:
        'docker run -e AWS_SECRET_ACCESS_KEY="shouldBeRedacted" -e GITHUB_TOKEN="ghp_should_be_redacted"',
      stderr:
        'Contains AWS_SECRET_ACCESS_KEY=actualSecretKey and ANTHROPIC_API_KEY=sk-ant-leaked-key',
      stdout: 'Output with JWT_SECRET=jwt-secret and DATABASE_URL=postgresql://user:pass@host/db',
      data: {
        credentials: 'nested-credential-data',
        auth: {
          token: 'deeply-nested-token'
        }
      }
    },
    request: {
      headers: {
        authorization: 'Bearer request-auth-token'
      }
    }
  },
  'Testing comprehensive nested redaction'
);

// Test process.env patterns
logger.warn(
  {
    'process.env.GITHUB_TOKEN': 'process-env-github-token',
    'process.env.AWS_SECRET_ACCESS_KEY': 'process-env-aws-secret',
    'process.env.ANTHROPIC_API_KEY': 'process-env-anthropic-key'
  },
  'Testing process.env redaction'
);

// Test database and connection strings
logger.info(
  {
    DATABASE_URL: 'postgresql://username:password@localhost:5432/mydb',
    connectionString: 'Server=myServer;Database=myDB;User Id=myUser;Password=myPassword;',
    mongoUrl: 'mongodb+srv://user:pass@cluster.mongodb.net/database',
    redisUrl: 'redis://user:password@host:6379/0'
  },
  'Testing database connection string redaction'
);

console.log('\n=== Enhanced Redaction Test Results ===');
console.log('Check the logged output above - all sensitive values should show as [REDACTED]');
console.log(
  'If you see any actual secrets, passwords, tokens, or API keys, the redaction needs improvement.'
);
console.log('\nSensitive patterns that should be redacted:');
console.log('- GitHub tokens (github_pat_*, ghp_*)');
console.log('- AWS credentials (AKIA*, access keys, session tokens)');
console.log('- Anthropic API keys (sk-ant-*)');
console.log('- Database passwords and connection strings');
console.log('- Docker commands with embedded secrets');
console.log('- HTTP authorization headers');
console.log('- Generic passwords, secrets, tokens, API keys');
console.log('\nData that should remain visible:');
console.log('- Usernames, emails, repo names');
console.log('- Public configuration values');
console.log('- Non-sensitive debugging information');
