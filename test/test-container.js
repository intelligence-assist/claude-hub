#!/usr/bin/env node

/**
 * Test script for Claude container execution
 *
 * This script tests the Claude container execution by directly using the
 * claudeService processCommand function with container mode enabled.
 */

require('dotenv').config();
const { processCommand } = require('./src/services/claudeService');
// Uncomment if logging is needed
// const { createLogger } = require('./src/utils/logger');

// Configuration
const repoFullName = process.argv[2] || 'test-org/test-repo';
const command = process.argv[3] || 'Explain what this repository does in one paragraph';

// Force container mode
process.env.CLAUDE_USE_CONTAINERS = '1';

// Set a test issue number
const issueNumber = 0;

async function testContainer() {
  console.log('\nClaude Container Test');
  console.log('====================');
  console.log(`Repository: ${repoFullName}`);
  console.log(`Command: "${command}"`);
  console.log('Container Mode: Enabled');
  console.log(`Container Image: ${process.env.CLAUDE_CONTAINER_IMAGE || 'claudecode:latest'}`);
  console.log('\nExecuting Claude in container...');

  try {
    console.time('Execution time');

    const response = await processCommand({
      repoFullName,
      issueNumber,
      command,
      useContainer: true
    });

    console.timeEnd('Execution time');
    console.log('\n--- Claude Response ---\n');
    console.log(response);
    console.log('\n--- End Response ---\n');

    return 0;
  } catch (error) {
    console.error('\nError during container execution:');
    console.error(error.message);

    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    return 1;
  }
}

// Run the test
testContainer()
  .then(exitCode => {
    if (exitCode !== 0) {
      throw new Error(`Test failed with exit code ${exitCode}`);
    }
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    throw error;
  });
