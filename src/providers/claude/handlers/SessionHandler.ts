import { createLogger } from '../../../utils/logger';
import type {
  WebhookEventHandler,
  WebhookHandlerResponse,
  WebhookContext
} from '../../../types/webhook';
import type { ClaudeWebhookPayload } from '../ClaudeWebhookProvider';
import type { ClaudeSession } from '../../../types/claude-orchestration';
import { SessionManager } from '../services/SessionManager';
import { randomUUID } from 'crypto';

const logger = createLogger('SessionHandler');

interface SessionCreatePayload {
  type: 'session.create';
  session: Partial<ClaudeSession>;
}

interface SessionGetPayload {
  type: 'session.get';
  sessionId: string;
}

interface SessionListPayload {
  type: 'session.list';
  orchestrationId?: string;
}

interface SessionStartPayload {
  type: 'session.start';
  sessionId: string;
}

interface SessionOutputPayload {
  type: 'session.output';
  sessionId: string;
}

type SessionPayload =
  | SessionCreatePayload
  | SessionGetPayload
  | SessionListPayload
  | SessionStartPayload
  | SessionOutputPayload;

/**
 * Handler for individual Claude session management
 * Provides CRUD operations for MCP integration
 */
export class SessionHandler implements WebhookEventHandler<ClaudeWebhookPayload> {
  event = 'session';
  private sessionManager: SessionManager;

  constructor() {
    this.sessionManager = new SessionManager();
  }

  /**
   * Check if this handler can handle the request
   */
  canHandle(payload: ClaudeWebhookPayload): boolean {
    return payload.data.type?.startsWith('session.');
  }

  /**
   * Handle session management requests
   */
  async handle(
    payload: ClaudeWebhookPayload,
    _context: WebhookContext
  ): Promise<WebhookHandlerResponse> {
    try {
      const data = payload.data as SessionPayload;

      switch (data.type) {
        case 'session.create':
          return await this.handleCreateSession(data);

        case 'session.get':
          return await this.handleGetSession(data);

        case 'session.list':
          return await this.handleListSessions(data);

        case 'session.start':
          return await this.handleStartSession(data);

        case 'session.output':
          return await this.handleGetOutput(data);

        default:
          return {
            success: false,
            error: `Unknown session operation: ${(data as Record<string, unknown>).type}`
          };
      }
    } catch (error) {
      logger.error('Session operation failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session operation failed'
      };
    }
  }

  /**
   * Create a new Claude session
   */
  private async handleCreateSession(
    payload: SessionCreatePayload
  ): Promise<WebhookHandlerResponse> {
    const { session: partialSession } = payload;

    // Validate required fields
    if (!partialSession.project?.repository) {
      return {
        success: false,
        error: 'Repository is required for session creation'
      };
    }

    if (!partialSession.project?.requirements) {
      return {
        success: false,
        error: 'Requirements are required for session creation'
      };
    }

    // Create full session object
    const session: ClaudeSession = {
      id: partialSession.id ?? randomUUID(),
      type: partialSession.type ?? 'implementation',
      status: 'pending',
      project: partialSession.project,
      dependencies: partialSession.dependencies ?? [],
      output: undefined
    };

    // Create container but don't start it
    const containerId = await this.sessionManager.createContainer(session);

    const createdSession = {
      ...session,
      containerId,
      status: 'initializing' as const
    };

    logger.info('Session created', {
      sessionId: createdSession.id,
      type: createdSession.type,
      repository: createdSession.project.repository
    });

    return {
      success: true,
      message: 'Session created successfully',
      data: { session: createdSession }
    };
  }

  /**
   * Get session status
   */
  private handleGetSession(payload: SessionGetPayload): Promise<WebhookHandlerResponse> {
    const { sessionId } = payload;
    const session = this.sessionManager.getSession(sessionId);

    if (!session) {
      return Promise.resolve({
        success: false,
        error: `Session not found: ${sessionId}`
      });
    }

    return Promise.resolve({
      success: true,
      data: { session }
    });
  }

  /**
   * List sessions (optionally filtered by orchestration ID)
   */
  private handleListSessions(payload: SessionListPayload): Promise<WebhookHandlerResponse> {
    const { orchestrationId } = payload;

    let sessions: ClaudeSession[];
    if (orchestrationId) {
      sessions = this.sessionManager.getOrchestrationSessions(orchestrationId);
    } else {
      sessions = this.sessionManager.getAllSessions();
    }

    return Promise.resolve({
      success: true,
      data: { sessions }
    });
  }

  /**
   * Start a session
   */
  private async handleStartSession(payload: SessionStartPayload): Promise<WebhookHandlerResponse> {
    const { sessionId } = payload;
    const session = this.sessionManager.getSession(sessionId);

    if (!session) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`
      };
    }

    if (session.status !== 'initializing' && session.status !== 'pending') {
      return {
        success: false,
        error: `Session cannot be started in status: ${session.status}`
      };
    }

    // Check dependencies
    const unmetDependencies = session.dependencies.filter(depId => {
      const dep = this.sessionManager.getSession(depId);
      return !dep || dep.status !== 'completed';
    });

    if (unmetDependencies.length > 0) {
      // Queue the session to start when dependencies are met
      await this.sessionManager.queueSession(session);
      return {
        success: true,
        message: 'Session queued, waiting for dependencies',
        data: {
          session,
          waitingFor: unmetDependencies
        }
      };
    }

    // Start the session immediately
    await this.sessionManager.startSession(session);

    return {
      success: true,
      message: 'Session started',
      data: { session }
    };
  }

  /**
   * Get session output
   */
  private handleGetOutput(payload: SessionOutputPayload): Promise<WebhookHandlerResponse> {
    const { sessionId } = payload;
    const session = this.sessionManager.getSession(sessionId);

    if (!session) {
      return Promise.resolve({
        success: false,
        error: `Session not found: ${sessionId}`
      });
    }

    if (!session.output) {
      return Promise.resolve({
        success: true,
        data: {
          sessionId,
          status: session.status,
          output: null,
          message: 'Session has no output yet'
        }
      });
    }

    return Promise.resolve({
      success: true,
      data: {
        sessionId,
        status: session.status,
        output: session.output
      }
    });
  }
}
