import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { 
  SessionConfig, 
  SessionStatus,
  SessionListOptions
} from '../types/session';
import { DockerUtils } from './dockerUtils';

/**
 * Session manager for storing and retrieving Claude session data
 */
export class SessionManager {
  private sessionsDir: string;
  private dockerUtils: DockerUtils;

  constructor() {
    // Store sessions in ~/.claude-hub/sessions
    this.sessionsDir = path.join(os.homedir(), '.claude-hub', 'sessions');
    this.ensureSessionsDirectory();
    this.dockerUtils = new DockerUtils();
  }

  /**
   * Ensure the sessions directory exists
   */
  private ensureSessionsDirectory(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Generate a new session ID
   */
  generateSessionId(): string {
    return uuidv4().substring(0, 8);
  }

  /**
   * Create a new session
   */
  createSession(sessionConfig: Omit<SessionConfig, 'id' | 'createdAt' | 'updatedAt'>): SessionConfig {
    const id = this.generateSessionId();
    const now = new Date().toISOString();
    
    const session: SessionConfig = {
      ...sessionConfig,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    this.saveSession(session);
    return session;
  }

  /**
   * Save session to disk
   */
  saveSession(session: SessionConfig): void {
    const filePath = path.join(this.sessionsDir, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
  }

  /**
   * Get session by ID
   */
  getSession(id: string): SessionConfig | null {
    try {
      const filePath = path.join(this.sessionsDir, `${id}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(fileContent) as SessionConfig;
    } catch (error) {
      console.error(`Error reading session ${id}:`, error);
      return null;
    }
  }

  /**
   * Update session status
   */
  updateSessionStatus(id: string, status: SessionStatus): boolean {
    const session = this.getSession(id);
    if (!session) {
      return false;
    }
    
    session.status = status;
    session.updatedAt = new Date().toISOString();
    this.saveSession(session);
    return true;
  }

  /**
   * Delete session
   */
  deleteSession(id: string): boolean {
    try {
      const filePath = path.join(this.sessionsDir, `${id}.json`);
      if (!fs.existsSync(filePath)) {
        return false;
      }
      
      fs.unlinkSync(filePath);
      return true;
    } catch (error) {
      console.error(`Error deleting session ${id}:`, error);
      return false;
    }
  }

  /**
   * List sessions with optional filtering
   */
  async listSessions(options: SessionListOptions = {}): Promise<SessionConfig[]> {
    try {
      const files = fs.readdirSync(this.sessionsDir)
        .filter(file => file.endsWith('.json'));
      
      let sessions = files.map(file => {
        const filePath = path.join(this.sessionsDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent) as SessionConfig;
      });
      
      // Apply filters
      if (options.status) {
        sessions = sessions.filter(session => session.status === options.status);
      }
      
      if (options.repo) {
        const repoFilter = options.repo;
        sessions = sessions.filter(session => session.repoFullName.includes(repoFilter));
      }
      
      // Verify status of running sessions
      const runningSessionsToCheck = sessions.filter(session => session.status === 'running');
      await Promise.all(runningSessionsToCheck.map(async (session) => {
        const isRunning = await this.dockerUtils.isContainerRunning(session.containerId);
        if (!isRunning) {
          session.status = 'stopped';
          this.updateSessionStatus(session.id, 'stopped');
        }
      }));
      
      // Sort by creation date (newest first)
      sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // Apply limit if specified
      if (options.limit && options.limit > 0) {
        sessions = sessions.slice(0, options.limit);
      }
      
      return sessions;
    } catch (error) {
      console.error('Error listing sessions:', error);
      return [];
    }
  }

  /**
   * Recover a session by recreating the container
   */
  async recoverSession(id: string): Promise<boolean> {
    try {
      const session = this.getSession(id);
      if (!session) {
        console.error(`Session ${id} not found`);
        return false;
      }
      
      if (session.status !== 'stopped') {
        console.error(`Session ${id} is not stopped (status: ${session.status})`);
        return false;
      }
      
      // Generate a new container name
      const containerName = `claude-hub-${session.id}-recovered`;
      
      // Prepare environment variables for the container
      const envVars: Record<string, string> = {
        REPO_FULL_NAME: session.repoFullName,
        ISSUE_NUMBER: session.issueNumber ? String(session.issueNumber) : (session.prNumber ? String(session.prNumber) : ''),
        IS_PULL_REQUEST: session.isPullRequest ? 'true' : 'false',
        IS_ISSUE: session.isIssue ? 'true' : 'false',
        BRANCH_NAME: session.branchName || '',
        OPERATION_TYPE: 'default',
        COMMAND: session.command,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
        BOT_USERNAME: process.env.BOT_USERNAME || 'ClaudeBot',
        BOT_EMAIL: process.env.BOT_EMAIL || 'claude@example.com'
      };
      
      // Start the container
      const containerId = await this.dockerUtils.startContainer(
        containerName,
        envVars,
        session.resourceLimits
      );
      
      if (!containerId) {
        console.error('Failed to start container for session recovery');
        return false;
      }
      
      // Update session with new container ID and status
      session.containerId = containerId;
      session.status = 'running';
      session.updatedAt = new Date().toISOString();
      this.saveSession(session);
      
      console.log(`Session ${id} recovered with new container ID: ${containerId}`);
      return true;
    } catch (error) {
      console.error(`Error recovering session ${id}:`, error);
      return false;
    }
  }

  /**
   * Synchronize session status with container status
   * Updates session statuses based on actual container states
   */
  async syncSessionStatuses(): Promise<void> {
    try {
      const sessions = await this.listSessions();
      
      for (const session of sessions) {
        if (session.status === 'running') {
          const isRunning = await this.dockerUtils.isContainerRunning(session.containerId);
          if (!isRunning) {
            session.status = 'stopped';
            this.updateSessionStatus(session.id, 'stopped');
            console.log(`Updated session ${session.id} status from running to stopped (container not found)`);
          }
        }
      }
    } catch (error) {
      console.error('Error syncing session statuses:', error);
    }
  }
}