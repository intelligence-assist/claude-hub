// Mock implementation of DockerUtils for testing
export const mockStartContainer = jest.fn().mockResolvedValue('mock-container-id');
export const mockStopContainer = jest.fn().mockResolvedValue(true);
export const mockGetContainerLogs = jest.fn().mockResolvedValue('Mock container logs');
export const mockIsContainerRunning = jest.fn().mockResolvedValue(true);
export const mockGetContainerStats = jest.fn().mockResolvedValue({
  cpu: '5%',
  memory: '100MB / 2GB',
  status: 'running',
});

const mockDockerUtils = jest.fn().mockImplementation(() => {
  return {
    startContainer: mockStartContainer,
    stopContainer: mockStopContainer,
    getContainerLogs: mockGetContainerLogs,
    isContainerRunning: mockIsContainerRunning,
    getContainerStats: mockGetContainerStats,
  };
});

export default mockDockerUtils;