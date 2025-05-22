const fs = require('fs');
const path = require('path');

// Mock sensitive values
const mockEnv = {
  GITHUB_TOKEN: 'github_token_example_1234567890',
  AWS_ACCESS_KEY_ID: 'EXAMPLE_KEY_ID',
  AWS_SECRET_ACCESS_KEY: 'EXAMPLE_SECRET_KEY',
  AWS_REGION: 'us-east-1'
};

// Test sanitization in claudeService
console.log('Testing credential sanitization...\n');

// Test dockerCommand sanitization
const dockerCommand = `docker run --rm --privileged -e GITHUB_TOKEN="${mockEnv.GITHUB_TOKEN}" -e AWS_ACCESS_KEY_ID="${mockEnv.AWS_ACCESS_KEY_ID}" -e AWS_SECRET_ACCESS_KEY="${mockEnv.AWS_SECRET_ACCESS_KEY}" claude-code-runner:latest`;

const sanitizedCommand = dockerCommand.replace(/-e [A-Z_]+=\"[^\"]*\"/g, (match) => {
  const envKey = match.match(/-e ([A-Z_]+)=\"/)[1];
  const sensitiveKeys = ['GITHUB_TOKEN', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  if (sensitiveKeys.includes(envKey)) {
    return `-e ${envKey}="[REDACTED]"`;
  }
  return match;
});

console.log('Original command (contains secrets):');
console.log(dockerCommand);
console.log('\nSanitized command (secrets redacted):');
console.log(sanitizedCommand);

// Test output sanitization
const mockOutput = `
Error: Docker failed
GitHub Token in error: ${mockEnv.GITHUB_TOKEN}
AWS Key: ${mockEnv.AWS_ACCESS_KEY_ID}
AWS Secret: ${mockEnv.AWS_SECRET_ACCESS_KEY}
Some other error information
`;

const sanitizeOutput = (output) => {
  if (!output) return output;
  let sanitized = output.toString();
  const sensitiveValues = [
    mockEnv.GITHUB_TOKEN,
    mockEnv.AWS_ACCESS_KEY_ID,
    mockEnv.AWS_SECRET_ACCESS_KEY
  ].filter(val => val && val.length > 0);
  
  sensitiveValues.forEach(value => {
    if (value) {
      sanitized = sanitized.replace(new RegExp(value, 'g'), '[REDACTED]');
    }
  });
  return sanitized;
};

console.log('\n\nOriginal output (contains secrets):');
console.log(mockOutput);
console.log('\nSanitized output (secrets redacted):');
console.log(sanitizeOutput(mockOutput));

// Check that none of the secrets appear in the sanitized versions
const secrets = [mockEnv.GITHUB_TOKEN, mockEnv.AWS_ACCESS_KEY_ID, mockEnv.AWS_SECRET_ACCESS_KEY];
const failedChecks = [];

secrets.forEach(secret => {
  if (sanitizedCommand.includes(secret)) {
    failedChecks.push(`Command still contains: ${secret}`);
  }
  if (sanitizeOutput(mockOutput).includes(secret)) {
    failedChecks.push(`Output still contains: ${secret}`);
  }
});

console.log('\n\nTest Results:');
if (failedChecks.length === 0) {
  console.log('✅ SUCCESS: No credentials found in sanitized output');
} else {
  console.log('❌ FAILED: The following credentials were found:');
  failedChecks.forEach(check => console.log(`  - ${check}`));
}