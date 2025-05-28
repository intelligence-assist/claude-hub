module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/test/unit/**/*.test.{js,ts}',
    '**/test/integration/**/*.test.{js,ts}',
    '**/test/e2e/scenarios/**/*.test.{js,ts}'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: 'tsconfig.json'
    }],
    '^.+\\.js$': 'babel-jest'
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  testTimeout: 30000, // Some tests might take longer due to container initialization
  verbose: true,
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'test-results/jest', outputName: 'results.xml' }]
  ]
};