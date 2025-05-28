/**
 * Mock Startup Metrics for testing
 */

const startupMetrics = {
  recordContainerStartTime: jest.fn(),
  recordContainerInitTime: jest.fn(),
  recordContainerReadyTime: jest.fn(),
  recordTotalStartupTime: jest.fn(),
  getMetrics: jest.fn().mockReturnValue({
    containerStartTime: 100,
    containerInitTime: 200, 
    containerReadyTime: 300,
    totalStartupTime: 600
  })
};

module.exports = startupMetrics;
module.exports.default = startupMetrics;