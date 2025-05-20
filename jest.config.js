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