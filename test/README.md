# Claude Webhook Testing Framework

This directory contains the test framework for the Claude Webhook service. The tests are organized into three categories: unit tests, integration tests, and end-to-end (E2E) tests.

## Test Organization

```
/test
  /unit             # Unit tests for individual components
    /controllers    # Tests for controllers
    /services       # Tests for services
    /providers      # Tests for chatbot providers
    /security       # Security-focused tests
    /utils          # Tests for utility functions
  /integration      # Integration tests between components
    /github         # GitHub integration tests
    /claude         # Claude API integration tests
    /aws            # AWS credential tests
  /e2e              # End-to-end tests
    /scripts        # Shell scripts and helpers for E2E tests
    /scenarios      # Jest test scenarios for E2E testing
```

## Running Tests

### All Tests

```bash
npm test
```

### Specific Test Types

```bash
# Run only unit tests
npm run test:unit

# Run only chatbot provider tests
npm run test:chatbot

# Run only integration tests
npm run test:integration

# Run only E2E tests
npm run test:e2e

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode (for development)
npm run test:watch
```

## Test Types

### Unit Tests

Unit tests focus on testing individual components in isolation. They use Jest's mocking capabilities to replace dependencies with test doubles. These tests are fast and reliable, making them ideal for development and CI/CD pipelines.

#### Chatbot Provider Tests

The chatbot provider system includes comprehensive unit tests for:

- **Base Provider Interface** (`ChatbotProvider.test.js`): Tests the abstract base class and inheritance patterns
- **Discord Provider** (`DiscordProvider.test.js`): Tests Discord-specific webhook handling, signature verification, and message parsing
- **Provider Factory** (`ProviderFactory.test.js`): Tests dependency injection and provider management
- **Security Tests** (`signature-verification.test.js`): Tests webhook signature verification and security edge cases
- **Payload Tests** (`discord-payloads.test.js`): Tests real Discord webhook payloads and edge cases

Example:

```javascript
// Test for DiscordProvider.js
describe('Discord Provider', () => {
  test('should parse Discord slash command correctly', () => {
    const payload = { type: 2, data: { name: 'claude' } };
    const result = provider.parseWebhookPayload(payload);
    expect(result.type).toBe('command');
  });
});
```

### Integration Tests

Integration tests verify that different components work together correctly. They test the interactions between services, controllers, and external systems like GitHub and AWS.

Example:

```javascript
// Test for GitHub webhook processing
describe('GitHub Webhook Processing', () => {
  test('should process a comment with @MCPClaude mention', async () => {
    const response = await request(app).post('/api/webhooks/github').send(webhookPayload);

    expect(response.status).toBe(200);
  });
});
```

### E2E Tests

End-to-end tests verify that the entire system works correctly from start to finish. These tests often involve setting up Docker containers, simulating webhook events, and verifying that Claude responds correctly.

E2E tests are organized into:

- **Scripts**: Helper scripts for setting up test environments
- **Scenarios**: Jest tests that use the helper scripts to run E2E tests

Example:

```javascript
// Test for Claude container execution
describe('Container Execution E2E Tests', () => {
  test('Should process a simple Claude request', async () => {
    const response = await axios.post('/api/claude', {
      command: 'Hello Claude',
      repoFullName: 'test-org/test-repo'
    });

    expect(response.status).toBe(200);
  });
});
```

## Shell Scripts

The original shell scripts in `/test` are being gradually migrated to the new testing framework. Several one-off and debug scripts have been removed to clean up the codebase. The remaining shell scripts serve two purposes:

1. **E2E Infrastructure Tests**: Scripts that test container/environment configurations and will remain as separate scripts:

   - `test-claude-direct.sh` - Tests direct Claude container execution
   - `test-firewall.sh` - Tests firewall initialization
   - `test-container-privileged.sh` - Tests container privileges
   - `test-full-flow.sh` - Tests complete workflow

2. **Helper Scripts**: Scripts that are used by the E2E Jest tests:
   - `test-basic-container.sh` - Used by setupTestContainer.js
   - `test-claude-no-firewall.sh` - Used by setupTestContainer.js

## Writing New Tests

When writing new tests:

1. Determine the appropriate test type (unit, integration, or E2E)
2. Place the test in the correct directory
3. Follow the naming convention: `*.test.js`
4. Use Jest's mocking capabilities to isolate the component under test
5. Write clear, descriptive test names
6. Keep tests focused and maintainable

## Test Coverage

Run `npm run test:coverage` to generate a coverage report. The report will show which parts of the codebase are covered by tests and which are not.

## CI/CD Integration

The tests are designed to run in a CI/CD pipeline. The Jest configuration includes support for JUnit output via jest-junit, which can be used by CI systems like Jenkins, GitHub Actions, or CircleCI.
