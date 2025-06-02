import { DockerUtils } from '../../src/utils/dockerUtils';
import { promisify } from 'util';

// Mock the child_process module
jest.mock('child_process', () => ({
  exec: jest.fn(),
  execFile: jest.fn(),
  spawn: jest.fn(() => ({
    stdout: { pipe: jest.fn() },
    stderr: { pipe: jest.fn() },
    on: jest.fn()
  }))
}));

// Mock promisify to return our mocked exec/execFile functions
jest.mock('util', () => ({
  promisify: jest.fn((fn) => fn)
}));

describe('DockerUtils - Simple Tests', () => {
  let dockerUtils: DockerUtils;
  const mockExec = require('child_process').exec;
  const mockExecFile = require('child_process').execFile;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock implementations
    mockExec.mockImplementation((command: string, callback?: (error: Error | null, result: {stdout: string, stderr: string}) => void) => {
      if (callback) callback(null, { stdout: 'Mock exec output', stderr: '' });
      return Promise.resolve({ stdout: 'Mock exec output', stderr: '' });
    });
    
    mockExecFile.mockImplementation((file: string, args: string[], options?: any, callback?: (error: Error | null, result: {stdout: string, stderr: string}) => void) => {
      if (callback) callback(null, { stdout: 'Mock execFile output', stderr: '' });
      return Promise.resolve({ stdout: 'Mock execFile output', stderr: '' });
    });
    
    // Create a new instance for each test
    dockerUtils = new DockerUtils();
  });
  
  describe('isDockerAvailable', () => {
    it('should check if Docker is available', async () => {
      mockExec.mockResolvedValueOnce({ stdout: 'Docker version 20.10.7', stderr: '' });
      
      const result = await dockerUtils.isDockerAvailable();
      
      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('docker --version');
    });
    
    it('should return false if Docker is not available', async () => {
      mockExec.mockRejectedValueOnce(new Error('Docker not found'));
      
      const result = await dockerUtils.isDockerAvailable();
      
      expect(result).toBe(false);
      expect(mockExec).toHaveBeenCalledWith('docker --version');
    });
  });
  
  describe('doesImageExist', () => {
    it('should check if the Docker image exists', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'Image exists', stderr: '' });
      
      const result = await dockerUtils.doesImageExist();
      
      expect(result).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('docker', ['inspect', expect.any(String)]);
    });
    
    it('should return false if the Docker image does not exist', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('No such image'));
      
      const result = await dockerUtils.doesImageExist();
      
      expect(result).toBe(false);
      expect(mockExecFile).toHaveBeenCalledWith('docker', ['inspect', expect.any(String)]);
    });
  });
  
  describe('startContainer', () => {
    it('should start a Docker container', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'container-id', stderr: '' });
      
      const result = await dockerUtils.startContainer(
        'test-container',
        { REPO_FULL_NAME: 'owner/repo', COMMAND: 'test command' }
      );
      
      expect(result).toBe('container-id');
      expect(mockExecFile).toHaveBeenCalled();
    });
    
    it('should return null if container start fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('Failed to start container'));
      
      const result = await dockerUtils.startContainer(
        'test-container',
        { REPO_FULL_NAME: 'owner/repo', COMMAND: 'test command' }
      );
      
      expect(result).toBeNull();
      expect(mockExecFile).toHaveBeenCalled();
    });
  });
  
  describe('stopContainer', () => {
    it('should stop a container', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      const result = await dockerUtils.stopContainer('container-id');
      
      expect(result).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('docker', ['stop', 'container-id']);
    });
    
    it('should kill a container when force is true', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });
      
      const result = await dockerUtils.stopContainer('container-id', true);
      
      expect(result).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith('docker', ['kill', 'container-id']);
    });
    
    it('should return false if container stop fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('Failed to stop container'));
      
      const result = await dockerUtils.stopContainer('container-id');
      
      expect(result).toBe(false);
      expect(mockExecFile).toHaveBeenCalled();
    });
  });
});