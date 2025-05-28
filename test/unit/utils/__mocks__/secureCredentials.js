/**
 * Mock Secure Credentials for testing
 */

const secureCredentials = {
  get: jest.fn().mockImplementation(key => {
    // Return test values for common keys
    const mockValues = {
      'GITHUB_TOKEN': 'github-test-token',
      'GITHUB_WEBHOOK_SECRET': 'test-webhook-secret',
      'ANTHROPIC_API_KEY': 'test-claude-key',
      'BOT_USERNAME': '@TestBot',
      'AWS_ACCESS_KEY_ID': 'AKIATEST0000000FAKE',
      'AWS_SECRET_ACCESS_KEY': 'testsecreteKy000000000000000000000000FAKE',
      'AWS_REGION': 'us-west-2',
      'AWS_PROFILE': 'test-profile',
      'DISCORD_TOKEN': 'test-discord-token',
      'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/test',
      'BOT_EMAIL': 'test-bot@example.com'
    };
    
    return mockValues[key] || null;
  }),
  
  set: jest.fn(),
  
  remove: jest.fn(),
  
  list: jest.fn().mockReturnValue({
    'GITHUB_TOKEN': '***',
    'GITHUB_WEBHOOK_SECRET': '***',
    'ANTHROPIC_API_KEY': '***',
    'BOT_USERNAME': '@TestBot',
    'AWS_ACCESS_KEY_ID': '***',
    'AWS_SECRET_ACCESS_KEY': '***'
  }),
  
  isAvailable: jest.fn().mockReturnValue(true)
};

module.exports = secureCredentials;