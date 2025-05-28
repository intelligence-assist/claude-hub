/**
 * Mock child_process for testing
 */

module.exports = {
  execFileSync: jest.fn().mockReturnValue('mocked output'),
  execFile: jest.fn(),
  exec: jest.fn(),
  spawn: jest.fn()
};