import { randomUUID } from 'crypto';
import { createLogger } from '../../../utils/logger';
import type {
  WebhookEventHandler,
  WebhookHandlerResponse,
  WebhookContext
} from '../../../types/webhook';
import type {
  ClaudeSession,
  ClaudeOrchestrationResponse
} from '../../../types/claude-orchestration';
import type { ClaudeWebhookPayload } from '../ClaudeWebhookProvider';
import { SessionManager } from '../services/SessionManager';

const logger = createLogger('OrchestrationHandler');

/**
 * Handler for Claude orchestration requests
 * Simplified to create a single session - orchestration happens via MCP tools
 */
export class OrchestrationHandler implements WebhookEventHandler<ClaudeWebhookPayload> {
  event = 'orchestrate';
  private sessionManager: SessionManager;

  constructor() {
    this.sessionManager = new SessionManager();
  }

  /**
   * Check if this handler can handle the request
   */
  canHandle(payload: ClaudeWebhookPayload): boolean {
    return payload.data.type === 'orchestrate';
  }

  /**
   * Handle the orchestration request
   * Creates a single session - actual orchestration is handled by MCP tools
   */
  async handle(
    payload: ClaudeWebhookPayload,
    _context: WebhookContext
  ): Promise<WebhookHandlerResponse> {
    try {
      const data = payload.data;

      if (!data.project) {
        return {
          success: false,
          error: 'Project information is required for orchestration'
        };
      }

      logger.info('Creating orchestration session', {
        repository: data.project.repository,
        type: data.sessionType ?? 'coordination'
      });

      const orchestrationId = randomUUID();

      // Create a single coordination session
      const session: ClaudeSession = {
        id: `${orchestrationId}-orchestrator`,
        type: data.sessionType ?? 'coordination',
        status: 'pending',
        project: data.project,
        dependencies: [],
        output: undefined
      };

      // Initialize the session
      const containerId = await this.sessionManager.createContainer(session);
      const initializedSession = {
        ...session,
        containerId,
        status: 'initializing' as const
      };

      // Optionally start the session immediately
      if (data.autoStart !== false) {
        await this.sessionManager.startSession(initializedSession);
      }

      // Prepare response
      const response: ClaudeOrchestrationResponse = {
        orchestrationId,
        status: 'initiated',
        sessions: [initializedSession],
        summary: `Created orchestration session for ${data.project.repository}`
      };

      return {
        success: true,
        message: 'Orchestration session created',
        data: response
      };
    } catch (error) {
      logger.error('Failed to create orchestration session', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create orchestration session'
      };
    }
  }
}
