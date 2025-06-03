import { spawn, execSync } from 'child_process';
import { createLogger } from '../../../utils/logger';
import type {
  ClaudeSession,
  SessionOutput,
  SessionArtifact
} from '../../../types/claude-orchestration';

const logger = createLogger('SessionManager');

/**
 * Manages Claude container sessions for orchestration
 */
export class SessionManager {
  private sessions: Map<string, ClaudeSession> = new Map();
  private sessionQueues: Map<string, string[]> = new Map(); // sessionId -> waiting sessions

  /**
   * Create a container for a session
   */
  createContainer(session: ClaudeSession): Promise<string> {
    try {
      // Generate container name
      const containerName = `claude-${session.type}-${session.id.substring(0, 8)}`;

      // Get Docker image from environment
      const dockerImage = process.env.CLAUDE_CONTAINER_IMAGE ?? 'claudecode:latest';

      // Create container without starting it
      const createCmd = [
        'docker',
        'create',
        '--name',
        containerName,
        '--rm',
        '-e',
        `SESSION_ID=${session.id}`,
        '-e',
        `SESSION_TYPE=${session.type}`,
        '-e',
        `GITHUB_TOKEN=${process.env.GITHUB_TOKEN ?? ''}`,
        '-e',
        `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ?? ''}`,
        dockerImage
      ];

      execSync(createCmd.join(' '), { stdio: 'pipe' });

      logger.info('Container created', { sessionId: session.id, containerName });

      // Store session
      this.sessions.set(session.id, session);

      return Promise.resolve(containerName);
    } catch (error) {
      logger.error('Failed to create container', { sessionId: session.id, error });
      throw error;
    }
  }

  /**
   * Start a session
   */
  startSession(session: ClaudeSession): Promise<void> {
    try {
      if (!session.containerId) {
        throw new Error('Session has no container ID');
      }

      logger.info('Starting session', { sessionId: session.id, type: session.type });

      // Update session status
      session.status = 'running';
      session.startedAt = new Date();
      this.sessions.set(session.id, session);

      // Prepare the command based on session type
      const command = this.buildSessionCommand(session);

      // Start the container with the command
      const startCmd = ['docker', 'start', '-i', session.containerId];

      const dockerProcess = spawn(startCmd[0], startCmd.slice(1), {
        env: {
          ...process.env,
          CLAUDE_COMMAND: command
        }
      });

      // Collect output
      const logs: string[] = [];

      dockerProcess.stdout.on('data', data => {
        const line = data.toString();
        logs.push(line);
        logger.debug('Session output', { sessionId: session.id, line });
      });

      dockerProcess.stderr.on('data', data => {
        const line = data.toString();
        logs.push(`ERROR: ${line}`);
        logger.error('Session error', { sessionId: session.id, line });
      });

      dockerProcess.on('close', code => {
        session.status = code === 0 ? 'completed' : 'failed';
        session.completedAt = new Date();
        session.output = this.parseSessionOutput(logs);

        if (code !== 0) {
          session.error = `Process exited with code ${code}`;
        }

        this.sessions.set(session.id, session);
        logger.info('Session completed', { sessionId: session.id, status: session.status });

        // Notify waiting sessions
        this.notifyWaitingSessions(session.id);
      });

      return Promise.resolve();
    } catch (error) {
      logger.error('Failed to start session', { sessionId: session.id, error });
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';
      this.sessions.set(session.id, session);
      throw error;
    }
  }

  /**
   * Queue a session to start when dependencies are met
   */
  async queueSession(session: ClaudeSession): Promise<void> {
    // Check if all dependencies are completed
    const allDependenciesMet = session.dependencies.every(depId => {
      const dep = this.sessions.get(depId);
      return dep && dep.status === 'completed';
    });

    if (allDependenciesMet) {
      await this.startSession(session);
    } else {
      // Add to waiting queues
      for (const depId of session.dependencies) {
        const queue = this.sessionQueues.get(depId) ?? [];
        queue.push(session.id);
        this.sessionQueues.set(depId, queue);
      }
      logger.info('Session queued', { sessionId: session.id, waitingFor: session.dependencies });
    }
  }

  /**
   * Get session status
   */
  getSession(sessionId: string): ClaudeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for an orchestration
   */
  getOrchestrationSessions(orchestrationId: string): ClaudeSession[] {
    return Array.from(this.sessions.values()).filter(session =>
      session.id.startsWith(orchestrationId)
    );
  }

  /**
   * Build command for session based on type
   */
  private buildSessionCommand(session: ClaudeSession): string {
    const { repository, requirements, context } = session.project;

    switch (session.type) {
      case 'analysis':
        return `Analyze the project ${repository} and create a detailed implementation plan for: ${requirements}`;

      case 'implementation':
        return `Implement the following in ${repository}: ${requirements}. ${context ?? ''}`;

      case 'testing':
        return `Write comprehensive tests for the implementation in ${repository}`;

      case 'review':
        return `Review the code changes in ${repository} and provide feedback`;

      case 'coordination':
        return `Coordinate the implementation of ${requirements} in ${repository}`;

      default:
        return requirements;
    }
  }

  /**
   * Parse session output into structured format
   */
  private parseSessionOutput(logs: string[]): SessionOutput {
    const artifacts: SessionArtifact[] = [];
    const summary: string[] = [];
    const nextSteps: string[] = [];

    // Simple parsing - in reality, we'd have more sophisticated parsing
    for (const line of logs) {
      if (line.includes('Created file:')) {
        artifacts.push({
          type: 'file',
          path: line.split('Created file:')[1].trim()
        });
      } else if (line.includes('Committed:')) {
        artifacts.push({
          type: 'commit',
          sha: line.split('Committed:')[1].trim()
        });
      } else if (line.includes('Summary:')) {
        summary.push(line.split('Summary:')[1].trim());
      } else if (line.includes('Next step:')) {
        nextSteps.push(line.split('Next step:')[1].trim());
      }
    }

    return {
      logs,
      artifacts,
      summary: summary.length > 0 ? summary.join('\n') : 'Session completed',
      nextSteps
    };
  }

  /**
   * Notify waiting sessions when a dependency completes
   */
  private notifyWaitingSessions(completedSessionId: string): void {
    const waitingSessionIds = this.sessionQueues.get(completedSessionId) ?? [];

    for (const waitingId of waitingSessionIds) {
      const waitingSession = this.sessions.get(waitingId);
      if (waitingSession) {
        // Check if all dependencies are now met
        const allDependenciesMet = waitingSession.dependencies.every(depId => {
          const dep = this.sessions.get(depId);
          return dep && dep.status === 'completed';
        });

        if (allDependenciesMet) {
          logger.info('Starting waiting session', { sessionId: waitingId });
          this.startSession(waitingSession).catch(error => {
            logger.error('Failed to start waiting session', { sessionId: waitingId, error });
          });
        }
      }
    }

    // Clean up the queue
    this.sessionQueues.delete(completedSessionId);
  }
}
