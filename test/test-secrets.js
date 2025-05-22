// This file is for testing credential detection
// It contains intentional fake secrets that should be caught

const config = {
  // These should be detected by the scanner
  awsKey: 'EXAMPLE_KEY_ID',
  awsSecret: 'EXAMPLE_SECRET_KEY',
  githubToken: 'github_token_example_1234567890',
  npmToken: 'npm_abcdefghijklmnopqrstuvwxyz0123456789',

  // This should be allowed with pragma comment
  apiKey: 'not-a-real-key-123456', // pragma: allowlist secret

  // These are not secrets
  normalString: 'hello world',
  publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC...',
  version: '1.0.0'
};

// This should trigger entropy detection but we're not using it
// const highEntropyString = 'a7b9c3d5e7f9g1h3j5k7l9m1n3p5q7r9s1t3v5w7x9y1z3';

module.exports = config;
