// Global test setup
import path from 'path';
import fs from 'fs';
import os from 'os';

// Define test home directory path
const TEST_HOME_DIR = path.join(os.tmpdir(), 'claude-hub-test-home');

// Mock the HOME directory for testing
process.env.HOME = TEST_HOME_DIR;

// Create temp directories for testing
beforeAll(() => {
  // Create temp test home directory
  if (!fs.existsSync(TEST_HOME_DIR)) {
    fs.mkdirSync(TEST_HOME_DIR, { recursive: true });
  }
  
  // Create sessions directory
  const sessionsDir = path.join(TEST_HOME_DIR, '.claude-hub', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
});

// Clean up after tests
afterAll(() => {
  // Optional: Remove temp directories after tests
  // Uncomment if you want to clean up after tests
  // fs.rmSync(TEST_HOME_DIR, { recursive: true, force: true });
});

// Mock console.log to prevent noise during tests
global.console = {
  ...console,
  // Uncomment to silence logs during tests
  // log: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  error: console.error, // Keep error logs visible
};