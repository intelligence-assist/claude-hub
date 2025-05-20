# Test Reorganization Proposal

## Current State

The repository has been improved from its original state:
- Created Jest test structure in `/test/unit/`, `/test/integration/`, and `/test/e2e/`
- Created Jest configuration file for structured test execution
- Removed 8 one-off shell script tests that were redundant or debug-only
- Implemented some key unit tests for `awsCredentialProvider.js`
- Implemented containerExecution E2E test
- Preserved essential shell script tests for infrastructure testing

## Proposed Test Organization

### 1. Unit Tests (Jest)

Convert suitable JavaScript tests to Jest tests and organize in a structured way:

```
/test
  /unit
    /controllers
      githubController.test.js
    /services
      claudeService.test.js
      githubService.test.js
    /utils
      awsCredentialProvider.test.js
      logger.test.js
      sanitize.test.js
```

### 2. Integration Tests (Jest)

Convert integration-focused JavaScript tests to Jest tests:

```
/test
  /integration
    /github
      webhookProcessing.test.js
    /claude
      claudeApiResponse.test.js
    /aws
      credentialHandling.test.js
```

### 3. E2E Tests (Shell scripts + Jest)

Maintain shell scripts for true E2E tests that require container or environment setup:

```
/test
  /e2e
    /scripts  # Shell scripts that set up test environments
      setupTestContainer.sh
      setupFirewall.sh
    /scenarios  # Jest tests that use the shell scripts
      githubWebhookFlow.test.js
      claudeContainerExecution.test.js
```

## Test Dependencies

All required dependencies have been added:
- ✅ `jest` - Test framework for unit, integration and E2E tests
- ✅ `supertest` - For API testing
- ✅ `jest-junit` - For CI integration with test report generation
- ✅ `@types/jest` - For TypeScript support and IntelliSense

## Jest Configuration

✅ `jest.config.js` file has been created and configured:

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/unit/**/*.test.js',
    '**/test/integration/**/*.test.js',
    '**/test/e2e/scenarios/**/*.test.js'
  ],
  collectCoverage: true,
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  testTimeout: 30000, // Some tests might take longer due to container initialization
  verbose: true,
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'test-results/jest', outputName: 'results.xml' }]
  ],
};
```

## NPM Scripts

✅ `package.json` scripts have been updated:

```json
"scripts": {
  "start": "node src/index.js",
  "dev": "nodemon src/index.js",
  "test": "jest",
  "test:unit": "jest --testMatch='**/test/unit/**/*.test.js'",
  "test:integration": "jest --testMatch='**/test/integration/**/*.test.js'",
  "test:e2e": "jest --testMatch='**/test/e2e/scenarios/**/*.test.js'",
  "test:coverage": "jest --coverage",
  "test:watch": "jest --watch",
  "setup:dev": "pre-commit install"
}
```

## Conversion Priority

1. Convert unit-testable JavaScript modules first:
   - `awsCredentialProvider.js`
   - `logger.js`
   - `sanitize.js`

2. Next, convert service-level tests:
   - `claudeService.js`
   - `githubService.js`

3. Finally, address integration and E2E tests

## Shell Scripts to Preserve

These shell scripts test container/environment configurations and should remain:
- `test-claude-direct.sh`
- `test-firewall.sh`
- `test-container-privileged.sh`
- `test-full-flow.sh`

## Shell Scripts to Convert

These scripts could be converted to Jest tests:
- `test-aws-credential-provider.js` → Jest unit test (✅ Partially converted)
- `test-logger-redaction.js` → Jest unit test
- `test-webhook-response.js` → Jest integration test
- `test-claude-api.js` → Jest integration test

## One-Off Shell Scripts Removed

These debugging/one-off scripts have been removed to clean up the codebase:
- `test-debug-claude.sh` - Debug script for development
- `test-debug-response.sh` - Debug script for development
- `test-simple-error.sh` - Simple error test case
- `test-response-file.sh` - Tests response file handling
- `test-simple-claude.sh` - Simple Claude test covered by containerExecution.test.js
- `test-minimal-claude.sh` - Minimal Claude test used as utility
- `test-entrypoint.sh` - Entrypoint test covered by container tests
- `test-sudo-env.sh` - Environment handling covered by container tests

## Implementation Progress

1. ✅ Created directory structure
2. ✅ Set up Jest configuration
3. 🔄 Converting highest-priority unit tests (in progress)
   - ✅ `awsCredentialProvider.js` (partially completed)
   - ⬜ `logger.js` (pending)
   - ⬜ `sanitize.js` (pending)
4. ✅ Removed one-off test scripts
5. ✅ Created containerExecution.test.js E2E test
6. ✅ Set up CI integration with Jest-JUnit
7. ⬜ Convert remaining JavaScript tests (pending)
8. ✅ Documented test approach in README.md
9. ✅ Added test-container-cleanup.sh script for test automation

## Next Steps

1. Complete unit test migration for `awsCredentialProvider.js`
2. Add unit tests for `logger.js` and `sanitize.js`
3. Convert integration test scripts to Jest tests
4. Set up CI pipeline to run the Jest tests
5. Complete Docker container setup for test automation