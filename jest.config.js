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
  // Set more lenient coverage thresholds for PR builds
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 50,
      functions: 60,
      lines: 60
    },
    './src/controllers/': {
      statements: 60,
      branches: 50,
      functions: 80,
      lines: 60
    },
    './src/providers/': {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80
    },
    './src/services/': {
      statements: 60,
      branches: 50,
      functions: 80,
      lines: 60
    },
    // Exclude routes from coverage requirements for now
    './src/routes/': {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0
    },
    // Exclude type files from coverage requirements
    './src/types/': {
      statements: 0,
      branches: 0, 
      functions: 0,
      lines: 0
    }
  },
  testTimeout: 30000, // Some tests might take longer due to container initialization
  verbose: true,
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'test-results/jest', outputName: 'results.xml' }]
  ]
};