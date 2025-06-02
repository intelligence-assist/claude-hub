import { DockerUtils } from '../../src/utils/dockerUtils';
import { ResourceLimits } from '../../src/types/session';
import { exec, execFile } from 'child_process';

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn(),
  execFile: jest.fn(),
  spawn: jest.fn().mockReturnValue({
    stdout: { pipe: jest.fn() },
    stderr: { pipe: jest.fn() },
    on: jest.fn()
  })
}));

// Type for mocked exec function
type MockedExec = {
  mockImplementation: (fn: (...args: any[]) => any) => void;
  mockResolvedValue: (value: any) => void;
  mockRejectedValue: (value: any) => void;
};

// Type for mocked execFile function
type MockedExecFile = {
  mockImplementation: (fn: (...args: any[]) => any) => void;
  mockResolvedValue: (value: any) => void;
  mockRejectedValue: (value: any) => void;
};

describe('DockerUtils', () => {
  let dockerUtils: DockerUtils;
  
  // Mocks
  const mockedExec = exec as unknown as MockedExec;
  const mockedExecFile = execFile as unknown as MockedExecFile;
  
  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
    
    // Reset environment variables
    delete process.env.CLAUDE_CONTAINER_IMAGE;
    delete process.env.CLAUDE_AUTH_HOST_DIR;
    
    // Keep HOME from setup.ts
    
    // Create fresh instance for each test
    dockerUtils = new DockerUtils();
    
    // Default mock implementation for exec
    mockedExec.mockImplementation((command, callback) => {
      if (callback) {
        callback(null, { stdout: 'success', stderr: '' });
      }
      return { stdout: 'success', stderr: '' };
    });
    
    // Default mock implementation for execFile
    mockedExecFile.mockImplementation((file, args, options, callback) => {
      if (callback) {
        callback(null, { stdout: 'success', stderr: '' });
      }
      return { stdout: 'success', stderr: '' };
    });
  });
  
  describe('isDockerAvailable', () => {
    it('should return true when Docker is available', async () => {
      mockedExec.mockResolvedValue({ stdout: 'Docker version 20.10.7', stderr: '' });
      
      const result = await dockerUtils.isDockerAvailable();
      
      expect(result).toBe(true);
      expect(exec).toHaveBeenCalledWith('docker --version');
    });
    
    it('should return false when Docker is not available', async () => {
      mockedExec.mockRejectedValue(new Error('Command failed'));
      
      const result = await dockerUtils.isDockerAvailable();
      
      expect(result).toBe(false);
      expect(exec).toHaveBeenCalledWith('docker --version');
    });
  });
  
  describe('doesImageExist', () => {
    it('should return true when the image exists', async () => {
      mockedExecFile.mockResolvedValue({ stdout: 'Image details', stderr: '' });
      
      const result = await dockerUtils.doesImageExist();
      
      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        ['inspect', 'claudecode:latest']
      );
    });
    
    it('should return false when the image does not exist', async () => {
      mockedExecFile.mockRejectedValue(new Error('No such image'));
      
      const result = await dockerUtils.doesImageExist();
      
      expect(result).toBe(false);
    });
    
    it('should use custom image name from environment', async () => {
      process.env.CLAUDE_CONTAINER_IMAGE = 'custom-image:latest';
      
      // Create a new instance with updated env vars
      dockerUtils = new DockerUtils();
      
      mockedExecFile.mockResolvedValue({ stdout: 'Image details', stderr: '' });
      
      await dockerUtils.doesImageExist();
      
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        ['inspect', 'custom-image:latest'],
        { stdio: 'ignore' }
      );
    });
  });
  
  describe('ensureImageExists', () => {
    it('should return true when the image already exists', async () => {
      // Mock doesImageExist to return true
      mockedExecFile.mockResolvedValue({ stdout: 'Image details', stderr: '' });
      
      const result = await dockerUtils.ensureImageExists();
      
      expect(result).toBe(true);
      // Should not try to build the image
      expect(execFile).not.toHaveBeenCalledWith(
        'docker',
        ['build', '-f', 'Dockerfile.claudecode', '-t', 'claudecode:latest', '.'],
        expect.anything()
      );
    });
    
    it('should build the image when it does not exist', async () => {
      // First call to execFile (doesImageExist) fails
      // Second call to execFile (build) succeeds
      mockedExecFile.mockImplementation((file, args, options, callback) => {
        if (args[0] === 'inspect') {
          throw new Error('No such image');
        }
        if (callback) {
          callback(null, { stdout: 'Built image', stderr: '' });
        }
        return { stdout: 'Built image', stderr: '' };
      });
      
      const result = await dockerUtils.ensureImageExists();
      
      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        ['build', '-f', 'Dockerfile.claudecode', '-t', 'claudecode:latest', '.'],
        expect.anything()
      );
    });
    
    it('should return false when build fails', async () => {
      // Mock doesImageExist to return false
      mockedExecFile.mockImplementation((file, args, options, callback) => {
        if (args[0] === 'inspect') {
          throw new Error('No such image');
        }
        if (args[0] === 'build') {
          throw new Error('Build failed');
        }
        return { stdout: '', stderr: 'Build failed' };
      });
      
      const result = await dockerUtils.ensureImageExists();
      
      expect(result).toBe(false);
    });
  });
  
  describe('startContainer', () => {
    it('should start a container with default resource limits', async () => {
      mockedExecFile.mockResolvedValue({ stdout: 'container-id', stderr: '' });
      
      const result = await dockerUtils.startContainer(
        'test-container',
        { REPO_FULL_NAME: 'test/repo', COMMAND: 'test command' }
      );
      
      expect(result).toBe('container-id');
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining([
          'run', '-d', '--rm',
          '--name', 'test-container',
          '--memory', '2g',
          '--cpu-shares', '1024',
          '--pids-limit', '256'
        ]),
        undefined
      );
    });
    
    it('should start a container with custom resource limits', async () => {
      mockedExecFile.mockResolvedValue({ stdout: 'container-id', stderr: '' });
      
      const resourceLimits: ResourceLimits = {
        memory: '4g',
        cpuShares: '2048',
        pidsLimit: '512'
      };
      
      const result = await dockerUtils.startContainer(
        'test-container',
        { REPO_FULL_NAME: 'test/repo', COMMAND: 'test command' },
        resourceLimits
      );
      
      expect(result).toBe('container-id');
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining([
          'run', '-d', '--rm',
          '--name', 'test-container',
          '--memory', '4g',
          '--cpu-shares', '2048',
          '--pids-limit', '512'
        ]),
        undefined
      );
    });
    
    it('should add environment variables to the container', async () => {
      mockedExecFile.mockResolvedValue({ stdout: 'container-id', stderr: '' });
      
      await dockerUtils.startContainer(
        'test-container',
        {
          REPO_FULL_NAME: 'test/repo',
          COMMAND: 'test command',
          GITHUB_TOKEN: 'secret-token',
          IS_PULL_REQUEST: 'true'
        }
      );
      
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining([
          '-e', 'REPO_FULL_NAME=test/repo',
          '-e', 'COMMAND=test command',
          '-e', 'GITHUB_TOKEN=secret-token',
          '-e', 'IS_PULL_REQUEST=true'
        ]),
        undefined
      );
    });
    
    it('should return null when container start fails', async () => {
      mockedExecFile.mockRejectedValue(new Error('Start failed'));
      
      const result = await dockerUtils.startContainer(
        'test-container',
        { REPO_FULL_NAME: 'test/repo', COMMAND: 'test command' }
      );
      
      expect(result).toBeNull();
    });
  });
  
  describe('stopContainer', () => {
    it('should stop a container', async () => {
      mockedExecFile.mockResolvedValue({ stdout: '', stderr: '' });
      
      const result = await dockerUtils.stopContainer('container-id');
      
      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        ['stop', 'container-id'],
        undefined
      );
    });
    
    it('should force kill a container when force is true', async () => {
      mockedExecFile.mockResolvedValue({ stdout: '', stderr: '' });
      
      const result = await dockerUtils.stopContainer('container-id', true);
      
      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        ['kill', 'container-id'],
        undefined
      );
    });
    
    it('should return false when stop fails', async () => {
      mockedExecFile.mockRejectedValue(new Error('Stop failed'));
      
      const result = await dockerUtils.stopContainer('container-id');
      
      expect(result).toBe(false);
    });
  });
  
  describe('getContainerLogs', () => {
    it('should get container logs', async () => {
      mockedExecFile.mockResolvedValue({ stdout: 'Container log output', stderr: '' });
      
      const result = await dockerUtils.getContainerLogs('container-id');
      
      expect(result).toBe('Container log output');
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        ['logs', 'container-id'],
        undefined
      );
    });
    
    it('should get container logs with tail option', async () => {
      mockedExecFile.mockResolvedValue({ stdout: 'Container log output', stderr: '' });
      
      await dockerUtils.getContainerLogs('container-id', false, 100);
      
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        ['logs', '--tail', '100', 'container-id'],
        undefined
      );
    });
    
    it('should handle follow mode', async () => {
      const result = await dockerUtils.getContainerLogs('container-id', true);
      
      expect(result).toBe('Streaming logs...');
      // Verify spawn was called (in child_process mock)
      const { spawn } = require('child_process');
      expect(spawn).toHaveBeenCalledWith(
        'docker',
        ['logs', '-f', 'container-id'],
        expect.anything()
      );
    });
    
    it('should handle errors', async () => {
      mockedExecFile.mockRejectedValue(new Error('Logs failed'));
      
      const result = await dockerUtils.getContainerLogs('container-id');
      
      expect(result).toContain('Error retrieving logs');
    });
  });
  
  describe('isContainerRunning', () => {
    // Set explicit timeout for these tests
    jest.setTimeout(10000);
    
    it('should return true for a running container', async () => {
      mockedExecFile.mockResolvedValue({ stdout: 'true', stderr: '' });
      
      const result = await dockerUtils.isContainerRunning('container-id');
      
      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        ['inspect', '--format', '{{.State.Running}}', 'container-id'],
        undefined
      );
    }, 10000); // Explicit timeout
    
    it('should return false for a stopped container', async () => {
      mockedExecFile.mockResolvedValue({ stdout: 'false', stderr: '' });
      
      const result = await dockerUtils.isContainerRunning('container-id');
      
      expect(result).toBe(false);
    }, 10000); // Explicit timeout
    
    it('should return false when container does not exist', async () => {
      mockedExecFile.mockImplementation(() => {
        throw new Error('No such container');
      });
      
      const result = await dockerUtils.isContainerRunning('container-id');
      
      expect(result).toBe(false);
    }, 10000); // Explicit timeout
  });
  
  describe('executeCommand', () => {
    jest.setTimeout(10000);
    
    it('should execute a command in a container', async () => {
      mockedExecFile.mockResolvedValue({ stdout: 'Command output', stderr: '' });
      
      const result = await dockerUtils.executeCommand('container-id', 'echo "hello"');
      
      expect(result).toBe('Command output');
      expect(execFile).toHaveBeenCalledWith(
        'docker',
        ['exec', 'container-id', 'bash', '-c', 'echo "hello"'],
        undefined
      );
    }, 10000); // Explicit timeout
    
    it('should throw an error when command execution fails', async () => {
      mockedExecFile.mockImplementation(() => {
        throw new Error('Command failed');
      });
      
      await expect(dockerUtils.executeCommand('container-id', 'invalid-command'))
        .rejects.toThrow('Command failed');
    }, 10000); // Explicit timeout
  });
});