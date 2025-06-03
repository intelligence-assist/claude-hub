import { randomUUID } from 'crypto';
import { createLogger } from '../../../utils/logger';
import type {
  WebhookEventHandler,
  WebhookHandlerResponse,
  WebhookContext
} from '../../../types/webhook';
import type {
  ClaudeOrchestrationPayload,
  ClaudeSession,
  ClaudeOrchestrationResponse
} from '../../../types/claude-orchestration';
import type { ClaudeWebhookPayload } from '../ClaudeWebhookProvider';
import { SessionManager } from '../services/SessionManager';
import { TaskDecomposer } from '../services/TaskDecomposer';

const logger = createLogger('OrchestrationHandler');

/**
 * Handler for Claude orchestration requests
 */
export class OrchestrationHandler implements WebhookEventHandler<ClaudeWebhookPayload> {
  event = 'orchestrate';
  private sessionManager: SessionManager;
  private taskDecomposer: TaskDecomposer;

  constructor() {
    this.sessionManager = new SessionManager();
    this.taskDecomposer = new TaskDecomposer();
  }

  /**
   * Check if this handler can handle the request
   */
  canHandle(payload: ClaudeWebhookPayload): boolean {
    return payload.data.type === 'orchestrate';
  }

  /**
   * Handle the orchestration request
   */
  async handle(
    payload: ClaudeWebhookPayload,
    _context: WebhookContext
  ): Promise<WebhookHandlerResponse> {
    try {
      const data = payload.data;
      logger.info('Starting orchestration for project', {
        repository: data.project.repository,
        strategy: data.strategy
      });

      const orchestrationId = randomUUID();

      // Decompose the task into sessions
      const sessions = await this.decomposeTask(data, orchestrationId);

      // Initialize sessions
      const initializedSessions = await this.initializeSessions(sessions);

      // Start sessions based on dependency mode
      await this.startSessions(initializedSessions, data.strategy?.dependencyMode ?? 'parallel');

      // Prepare response
      const response: ClaudeOrchestrationResponse = {
        orchestrationId,
        status: 'initiated',
        sessions: initializedSessions,
        summary: `Started ${initializedSessions.length} Claude sessions for ${data.project.repository}`
      };

      return {
        success: true,
        message: 'Orchestration initiated successfully',
        data: response
      };
    } catch (error) {
      logger.error('Orchestration failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Orchestration failed'
      };
    }
  }

  /**
   * Decompose the task into individual sessions
   */
  private async decomposeTask(
    payload: ClaudeOrchestrationPayload,
    orchestrationId: string
  ): Promise<ClaudeSession[]> {
    // Use TaskDecomposer to analyze requirements and create sessions
    const decomposition = await this.taskDecomposer.decompose(payload.project);

    const sessions: ClaudeSession[] = [];
    const sessionTypes = payload.strategy?.phases ?? [
      'analysis',
      'implementation',
      'testing',
      'review'
    ];

    // Create analysis session first
    const analysisSession: ClaudeSession = {
      id: `${orchestrationId}-analysis`,
      type: 'analysis',
      status: 'pending',
      project: payload.project,
      dependencies: [],
      output: undefined
    };
    sessions.push(analysisSession);

    // Create implementation sessions based on decomposition
    if (sessionTypes.includes('implementation')) {
      for (let i = 0; i < decomposition.components.length; i++) {
        const component = decomposition.components[i];
        const implSession: ClaudeSession = {
          id: `${orchestrationId}-impl-${i}`,
          type: 'implementation',
          status: 'pending',
          project: {
            ...payload.project,
            requirements: component.requirements,
            context: component.context
          },
          dependencies: [analysisSession.id],
          output: undefined
        };
        sessions.push(implSession);
      }
    }

    // Create testing session
    if (sessionTypes.includes('testing')) {
      const testSession: ClaudeSession = {
        id: `${orchestrationId}-testing`,
        type: 'testing',
        status: 'pending',
        project: payload.project,
        dependencies: sessions.filter(s => s.type === 'implementation').map(s => s.id),
        output: undefined
      };
      sessions.push(testSession);
    }

    // Create review session
    if (sessionTypes.includes('review')) {
      const reviewSession: ClaudeSession = {
        id: `${orchestrationId}-review`,
        type: 'review',
        status: 'pending',
        project: payload.project,
        dependencies: sessions
          .filter(s => s.type === 'implementation' || s.type === 'testing')
          .map(s => s.id),
        output: undefined
      };
      sessions.push(reviewSession);
    }

    return sessions;
  }

  /**
   * Initialize sessions
   */
  private async initializeSessions(sessions: ClaudeSession[]): Promise<ClaudeSession[]> {
    const initialized = await Promise.all(
      sessions.map(async session => {
        const containerId = await this.sessionManager.createContainer(session);
        return {
          ...session,
          status: 'initializing' as const,
          containerId
        };
      })
    );

    return initialized;
  }

  /**
   * Start sessions based on dependency mode
   */
  private async startSessions(sessions: ClaudeSession[], dependencyMode: string): Promise<void> {
    switch (dependencyMode) {
      case 'sequential': {
        // Start sessions one by one
        for (const session of sessions) {
          await this.sessionManager.startSession(session);
        }
        break;
      }

      case 'wait_for_core': {
        // Start analysis first, then parallel implementation, then test/review
        const analysisSessions = sessions.filter(s => s.type === 'analysis');
        await Promise.all(analysisSessions.map(s => this.sessionManager.startSession(s)));

        const implSessions = sessions.filter(s => s.type === 'implementation');
        await Promise.all(implSessions.map(s => this.sessionManager.startSession(s)));
        break;
      }

      case 'parallel':
      default: {
        // Start all sessions that have no dependencies
        const independentSessions = sessions.filter(s => s.dependencies.length === 0);
        await Promise.all(independentSessions.map(s => this.sessionManager.startSession(s)));

        // SessionManager will handle dependency-based starts
        const dependentSessions = sessions.filter(s => s.dependencies.length > 0);
        await Promise.all(dependentSessions.map(s => this.sessionManager.queueSession(s)));
        break;
      }
    }
  }
}
