/**
 * Comprehensive test script to verify logger credential redaction coverage
 * Tests all credential patterns, nested objects, and edge cases
 */

const { createLogger } = require('../src/utils/logger');

// Create a test logger
const logger = createLogger('test-redaction-comprehensive');

console.log('Testing comprehensive logger redaction coverage...\n');

// Test counter to track number of tests
let testCount = 0;

/**
 * Test helper to run a redaction test
 * @param {string} testName - Name of the test
 * @param {object} testData - Data to log and test
 */
function runRedactionTest(testName, testData) {
  testCount++;
  console.log(`\n=== Test ${testCount}: ${testName} ===`);
  logger.info(testData, `Testing: ${testName}`);
}

// Test 1: AWS Credentials in various forms
runRedactionTest('AWS Credentials - Direct', {
  AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
  AWS_SESSION_TOKEN: 'AQoDYXdzEJr...<remainder of security token>',
  AWS_SECURITY_TOKEN: 'AQoDYXdzEJr...<security token>'
});

// Test 2: AWS Credentials nested in objects
runRedactionTest('AWS Credentials - Nested', {
  config: {
    AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE'
  },
  envVars: {
    AWS_SECRET_ACCESS_KEY: 'another-secret-key',
    AWS_ACCESS_KEY_ID: 'AKIAI44QH8DHBEXAMPLE'
  },
  env: {
    AWS_SECRET_ACCESS_KEY: 'yet-another-secret',
    AWS_SESSION_TOKEN: 'session-token-example'
  }
});

// Test 3: GitHub Tokens in various patterns
runRedactionTest('GitHub Tokens', {
  GITHUB_TOKEN: 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyz',
  GH_TOKEN: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
  token: 'github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyz',
  secret: 'some-github-secret-value',
  headers: {
    authorization:
      'Bearer github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyz',
    'x-github-token': 'ghp_1234567890abcdefghijklmnopqrstuvwxyz'
  }
});

// Test 4: Anthropic API Keys
runRedactionTest('Anthropic API Keys', {
  ANTHROPIC_API_KEY: 'sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz',
  apiKey: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890',
  api_key: 'sk-ant-another-key-example',
  authentication: {
    key: 'sk-ant-nested-key-example',
    token: 'sk-ant-token-example'
  }
});

// Test 5: Webhook Secrets
runRedactionTest('Webhook Secrets', {
  GITHUB_WEBHOOK_SECRET: 'webhook-secret-12345',
  WEBHOOK_SECRET: 'another-webhook-secret',
  secretKey: 'my-secret-key-value',
  secret_key: 'another_secret_key_value'
});

// Test 6: Database and Connection Strings
runRedactionTest('Database Credentials', {
  DATABASE_URL: 'postgresql://user:password@host:port/database',
  DB_PASSWORD: 'super-secret-db-password',
  REDIS_PASSWORD: 'redis-secret-password',
  connectionString:
    'Server=myServerAddress;Database=myDataBase;User Id=myUsername;Password=myPassword;',
  dbUrl: 'mongodb://username:password@host:port/database',
  mongoUrl: 'mongodb+srv://user:pass@cluster.mongodb.net/db',
  redisUrl: 'redis://user:password@host:port/0'
});

// Test 7: Docker Commands with embedded secrets
runRedactionTest('Docker Commands', {
  dockerCommand:
    'docker run -e GITHUB_TOKEN="ghp_secrettoken123" -e AWS_SECRET_ACCESS_KEY="secretkey456" myimage',
  dockerArgs: [
    'run',
    '-e',
    'GITHUB_TOKEN=ghp_anothersecret789',
    '-e',
    'AWS_SECRET_ACCESS_KEY=anothersecret'
  ],
  command: 'export AWS_SECRET_ACCESS_KEY="leaked-secret" && docker run myimage'
});

// Test 8: Process Environment Variables
runRedactionTest('Process Environment Variables', {
  'process.env.GITHUB_TOKEN': 'ghp_process_env_token',
  'process.env.AWS_SECRET_ACCESS_KEY': 'process-env-secret-key',
  'process.env.ANTHROPIC_API_KEY': 'sk-ant-process-env-key'
});

// Test 9: Output Streams (stderr, stdout)
runRedactionTest('Output Streams', {
  stderr: 'Error: Authentication failed with token ghp_leaked_in_stderr',
  stdout: 'Success: Connected with AWS_SECRET_ACCESS_KEY=leaked-in-stdout',
  output: 'Command output contains GITHUB_TOKEN=ghp_output_leak',
  logs: 'Log entry: Failed to authenticate with secret=leaked-secret',
  message: 'Error message: Invalid API key sk-ant-leaked-key',
  data: {
    errorOutput: 'Data contains AWS_ACCESS_KEY_ID=AKIAI44QH8DHBEXAMPLE'
  }
});

// Test 10: Error Objects
runRedactionTest('Error Objects', {
  error: {
    message: 'Connection failed with password=secret123',
    stderr: 'Error: Invalid GITHUB_TOKEN=ghp_error_token',
    stdout: 'Output: Using AWS_SECRET_ACCESS_KEY=error-secret',
    dockerCommand: 'docker run -e SECRET_KEY="error-leaked-secret" image',
    data: {
      credential: 'leaked-credential-in-error'
    }
  },
  err: {
    message: 'Another error with token=leaked-token',
    output: 'Error output with API_KEY=leaked-api-key'
  }
});

// Test 11: HTTP Headers and Request/Response Objects
runRedactionTest('HTTP Objects', {
  headers: {
    authorization: 'Bearer secret-bearer-token',
    'x-api-key': 'secret-api-key-header',
    'x-auth-token': 'secret-auth-token',
    bearer: 'secret-bearer-value'
  },
  request: {
    headers: {
      authorization: 'Bearer request-auth-token'
    }
  },
  response: {
    headers: {
      authorization: 'Bearer response-auth-token'
    }
  },
  req: {
    headers: {
      authorization: 'Bearer req-auth-token'
    }
  },
  res: {
    headers: {
      authorization: 'Bearer res-auth-token'
    }
  }
});

// Test 12: Generic sensitive field patterns
runRedactionTest('Generic Sensitive Fields', {
  password: 'user-password-123',
  passwd: 'another-password',
  pass: 'simple-pass',
  privateKey: 'private-key-content',
  private_key: 'another-private-key',
  credential: 'some-credential',
  credentials: 'user-credentials',
  key: 'secret-key-value',
  private: 'private-data'
});

// Test 13: Authentication Objects
runRedactionTest('Authentication Objects', {
  auth: {
    token: 'auth-object-token',
    secret: 'auth-object-secret',
    key: 'auth-object-key',
    password: 'auth-object-password'
  },
  authentication: {
    token: 'authentication-token',
    secret: 'authentication-secret',
    key: 'authentication-key',
    password: 'authentication-password'
  },
  userAuth: {
    token: 'nested-user-auth-token',
    secret: 'nested-user-auth-secret'
  }
});

// Test 14: File Paths that might contain credentials
runRedactionTest('File Paths', {
  credentialsPath: '/home/user/.aws/credentials',
  keyPath: '/path/to/private/key.pem',
  secretPath: '/secrets/api-key.txt'
});

// Test 15: JWT and other token types
runRedactionTest('JWT and Other Tokens', {
  JWT_SECRET: 'jwt-secret-signing-key',
  ACCESS_TOKEN: 'access-token-value',
  REFRESH_TOKEN: 'refresh-token-value',
  BOT_TOKEN: 'bot-token-secret',
  API_KEY: 'api-key-secret-value',
  SECRET_KEY: 'general-secret-key'
});

// Test 16: Complex nested structures
runRedactionTest('Complex Nested Structures', {
  application: {
    config: {
      database: {
        password: 'nested-db-password',
        connectionString: 'Server=server;Password=nested-password;'
      },
      api: {
        key: 'nested-api-key',
        secret: 'nested-api-secret',
        auth: {
          token: 'deeply-nested-token'
        }
      }
    },
    runtime: {
      envVars: {
        GITHUB_TOKEN: 'runtime-github-token',
        AWS_SECRET_ACCESS_KEY: 'runtime-aws-secret'
      },
      process: {
        env: {
          ANTHROPIC_API_KEY: 'runtime-anthropic-key'
        }
      }
    }
  }
});

// Test 17: Mixed safe and sensitive data
runRedactionTest('Mixed Safe and Sensitive Data', {
  // Safe data that should NOT be redacted
  username: 'user123',
  email: 'user@example.com',
  repo: 'owner/repository',
  issueNumber: 42,
  url: 'https://api.github.com/repos/owner/repo',

  // Sensitive data that SHOULD be redacted
  token: 'should-be-redacted-token',
  secret: 'should-be-redacted-secret',
  AWS_SECRET_ACCESS_KEY: 'should-be-redacted-aws-key',

  // Mixed nested object
  config: {
    publicSetting: 'this-is-fine',
    apiKey: 'this-should-be-redacted',
    debug: true,
    password: 'this-should-be-redacted-too'
  }
});

console.log('\n=== Redaction Test Summary ===');
console.log(`Total tests run: ${testCount}`);
console.log('\nReview the logged output above. All sensitive values should appear as [REDACTED].');
console.log('If you see any actual secrets, passwords, or tokens, the redaction is incomplete.');
console.log('\nThe following should be visible (not redacted):');
console.log('- Usernames, emails, repo names, URLs');
console.log('- Public configuration values');
console.log('- Non-sensitive debugging information');
console.log('\nThe following should be [REDACTED]:');
console.log('- All passwords, tokens, secrets, API keys');
console.log('- AWS credentials and session tokens');
console.log('- GitHub tokens and webhook secrets');
console.log('- Database connection strings and passwords');
console.log('- Docker commands containing sensitive environment variables');
console.log('- Error messages containing leaked credentials');
console.log('- HTTP headers with authorization data');
