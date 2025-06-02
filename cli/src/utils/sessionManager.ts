import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { 
  SessionConfig, 
  SessionStatus,
  SessionListOptions
} from '../types/session';

/**
 * Session manager for storing and retrieving Claude session data
 */
export class SessionManager {
  private sessionsDir: string;

  constructor() {
    // Store sessions in ~/.claude-hub/sessions
    this.sessionsDir = path.join(os.homedir(), '.claude-hub', 'sessions');
    this.ensureSessionsDirectory();
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
  listSessions(options: SessionListOptions = {}): SessionConfig[] {
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
        sessions = sessions.filter(session => session.repoFullName.includes(options.repo));
      }
      
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
}