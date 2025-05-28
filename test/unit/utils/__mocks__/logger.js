/**
 * Mock Logger for testing
 */

const logger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  trace: jest.fn(),
  log: jest.fn(),
  child: jest.fn().mockReturnThis(),
  withRequestId: jest.fn().mockReturnThis(),
  redact: jest.fn(input => {
    if (typeof input === 'string') {
      return '[REDACTED]';
    }
    return input;
  })
};

module.exports = { logger };