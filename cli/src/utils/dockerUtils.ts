import { promisify } from 'util';
import { exec, execFile } from 'child_process';
import path from 'path';
import { ResourceLimits } from '../types/session';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Utilities for Docker container operations
 */
export class DockerUtils {
  private dockerImageName: string;
  private entrypointScript: string;

  constructor() {
    // Use the same image name and entrypoint as the main service
    this.dockerImageName = process.env.CLAUDE_CONTAINER_IMAGE || 'claudecode:latest';
    this.entrypointScript = '/scripts/runtime/claudecode-entrypoint.sh';
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if the required Docker image exists
   */
  async doesImageExist(): Promise<boolean> {
    try {
      await execFileAsync('docker', ['inspect', this.dockerImageName]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build the Docker image if it doesn't exist
   */
  async ensureImageExists(): Promise<boolean> {
    if (await this.doesImageExist()) {
      return true;
    }

    console.log(`Building Docker image ${this.dockerImageName}...`);
    try {
      // Try to build from the repository root directory
      const repoRoot = path.resolve(process.cwd(), '..');
      await execFileAsync('docker', 
        ['build', '-f', path.join(repoRoot, 'Dockerfile.claudecode'), '-t', this.dockerImageName, repoRoot], 
        { cwd: repoRoot }
      );
      return true;
    } catch (error) {
      console.error('Failed to build Docker image:', error);
      return false;
    }
  }

  /**
   * Start a new container for a Claude session
   */
  async startContainer(
    containerName: string, 
    envVars: Record<string, string>,
    resourceLimits?: ResourceLimits
  ): Promise<string | null> {
    try {
      // Build docker run command as an array to prevent command injection
      const dockerArgs = ['run', '-d', '--rm'];

      // Add container name
      dockerArgs.push('--name', containerName);

      // Add resource limits if specified
      if (resourceLimits) {
        dockerArgs.push(
          '--memory', resourceLimits.memory,
          '--cpu-shares', resourceLimits.cpuShares,
          '--pids-limit', resourceLimits.pidsLimit
        );
      } else {
        // Default resource limits
        dockerArgs.push(
          '--memory', '2g',
          '--cpu-shares', '1024',
          '--pids-limit', '256'
        );
      }

      // Add required capabilities
      ['NET_ADMIN', 'SYS_ADMIN'].forEach(cap => {
        dockerArgs.push(`--cap-add=${cap}`);
      });

      // Add Claude authentication directory as a volume mount
      const claudeAuthDir = process.env.CLAUDE_AUTH_HOST_DIR || path.join(process.env.HOME || '~', '.claude');
      dockerArgs.push('-v', `${claudeAuthDir}:/home/node/.claude`);

      // Add environment variables
      Object.entries(envVars)
        .filter(([, value]) => value !== undefined && value !== '')
        .forEach(([key, value]) => {
          dockerArgs.push('-e', `${key}=${String(value)}`);
        });

      // Add the image name and custom entrypoint
      dockerArgs.push('--entrypoint', this.entrypointScript, this.dockerImageName);

      // Start the container
      const { stdout } = await execFileAsync('docker', dockerArgs);
      const containerId = stdout.trim();
      
      return containerId;
    } catch (error) {
      console.error('Failed to start container:', error);
      return null;
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string, force = false): Promise<boolean> {
    try {
      const command = force ? 'kill' : 'stop';
      await execFileAsync('docker', [command, containerId]);
      return true;
    } catch (error) {
      console.error(`Failed to stop container ${containerId}:`, error);
      return false;
    }
  }

  /**
   * Get logs from a container
   */
  async getContainerLogs(containerId: string, follow = false, tail?: number): Promise<string> {
    try {
      const args = ['logs'];
      
      if (follow) {
        args.push('-f');
      }
      
      if (tail !== undefined) {
        args.push('--tail', String(tail));
      }
      
      args.push(containerId);
      
      if (follow) {
        // For follow mode, we can't use execFileAsync as it would wait for the process to exit
        // Instead, we spawn the process and stream the output
        const { spawn } = require('child_process');
        const process = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        
        process.stdout.pipe(process.stdout);
        process.stderr.pipe(process.stderr);
        
        // Handle termination
        process.on('exit', () => {
          console.log('Log streaming ended');
        });
        
        return 'Streaming logs...';
      } else {
        const { stdout } = await execFileAsync('docker', args);
        return stdout;
      }
    } catch (error) {
      console.error(`Failed to get logs for container ${containerId}:`, error);
      return `Error retrieving logs: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Check if a container is running
   */
  async isContainerRunning(containerId: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('docker', ['inspect', '--format', '{{.State.Running}}', containerId]);
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Execute a command in a running container
   */
  async executeCommand(containerId: string, command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync('docker', [
        'exec', 
        containerId, 
        'bash', 
        '-c', 
        command
      ]);
      
      if (stderr) {
        console.error(`Command execution stderr: ${stderr}`);
      }
      
      return stdout;
    } catch (error) {
      console.error(`Failed to execute command in container ${containerId}:`, error);
      throw error;
    }
  }
}