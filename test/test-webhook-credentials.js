/**
 * Test script to verify that webhook responses don't expose credentials
 */

const fs = require('fs');
const path = require('path');

// Mock environment variables with sensitive data
process.env.GITHUB_TOKEN = 'ghp_verySecretGitHubToken123456789';
process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
process.env.AWS_REGION = 'us-east-1';
process.env.NODE_ENV = 'test';

// Load the Claude service
const claudeService = require('../src/services/claudeService');

console.log('Testing webhook credential handling...\n');

// Create a test case that simulates an error
async function testCredentialLeakPrevention() {
  try {
    // This should fail but not leak credentials
    const result = await claudeService.processCommand({
      repoFullName: 'test/repo',
      issueNumber: 1,
      command: 'test command',
      isPullRequest: false,
      branchName: null
    });
    
    console.log('Test result:', result);
  } catch (error) {
    console.log('Error caught (expected):', error.message);
    
    // Check if error message contains any credentials
    const errorMessage = error.message.toString();
    const credentials = [
      process.env.GITHUB_TOKEN,
      process.env.AWS_ACCESS_KEY_ID,
      process.env.AWS_SECRET_ACCESS_KEY
    ];
    
    let hasLeak = false;
    credentials.forEach(cred => {
      if (errorMessage.includes(cred)) {
        console.log(`❌ LEAKED: Error message contains ${cred.substring(0, 10)}...`);
        hasLeak = true;
      }
    });
    
    if (!hasLeak) {
      console.log('✅ SUCCESS: No credentials found in error message');
    }
    
    // Also check the error object if it has stderr/stdout
    if (error.stderr) {
      const stderr = error.stderr.toString();
      credentials.forEach(cred => {
        if (stderr.includes(cred)) {
          console.log(`❌ LEAKED: stderr contains ${cred.substring(0, 10)}...`);
        }
      });
    }
  }
}

// Run the test
testCredentialLeakPrevention()
  .then(() => console.log('\nTest completed'))
  .catch(err => console.error('Test failed:', err));