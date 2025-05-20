/**
 * Test script to verify logger credential redaction
 */

const { createLogger } = require('../src/utils/logger');

// Create a test logger
const logger = createLogger('test-redaction');

console.log('Testing logger redaction...\n');

// Test various scenarios
const testData = {
  // Direct sensitive fields
  GITHUB_TOKEN: 'github_token_example_1234567890',
  AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  
  // Nested in envVars
  envVars: {
    GITHUB_TOKEN: 'github_token_example_nested',
    AWS_ACCESS_KEY_ID: 'EXAMPLE_NESTED_KEY_ID',
    AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/NESTED/KEY'
  },
  
  // Docker command
  dockerCommand: 'docker run -e GITHUB_TOKEN="github_token_example_command" -e AWS_SECRET_ACCESS_KEY="secretInCommand"',
  
  // Error outputs
  stderr: 'Error: Failed with token github_token_example_error and key AKIAIOSFODNN7ERROR',
  stdout: 'Output contains secret wJalrXUtnFEMI/OUTPUT/KEY',
  
  // Other fields that should pass through
  normalField: 'This is normal data',
  repo: 'owner/repo',
  issueNumber: 123
};

// Log the test data
logger.info(testData, 'Testing logger redaction');

// Also test nested objects
logger.error({
  error: {
    message: 'Something failed',
    dockerCommand: 'docker run -e AWS_SECRET_ACCESS_KEY="shouldBeRedacted"',
    stderr: 'Contains AWS_SECRET_ACCESS_KEY=actualSecretKey'
  }
}, 'Testing nested redaction');

console.log('\nCheck the logged output above - all sensitive values should show as [REDACTED]');
console.log('If you see any actual secrets, the redaction is not working properly.');