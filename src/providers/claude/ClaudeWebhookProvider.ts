import type { WebhookRequest } from '../../types/express';
import type { WebhookProvider, BaseWebhookPayload } from '../../types/webhook';
import type { ClaudeOrchestrationPayload } from '../../types/claude-orchestration';

/**
 * Claude webhook payload that conforms to BaseWebhookPayload
 */
export interface ClaudeWebhookPayload extends BaseWebhookPayload {
  data: ClaudeOrchestrationPayload;
}

/**
 * Claude webhook provider for orchestration
 */
export class ClaudeWebhookProvider implements WebhookProvider<ClaudeWebhookPayload> {
  readonly name = 'claude';

  /**
   * Verify webhook signature - for Claude we'll use a simple bearer token for now
   */
  verifySignature(req: WebhookRequest, secret: string): Promise<boolean> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return Promise.resolve(false);
    }

    const token = authHeader.substring(7);
    return Promise.resolve(token === secret);
  }

  /**
   * Parse the Claude orchestration payload
   */
  parsePayload(req: WebhookRequest): Promise<ClaudeWebhookPayload> {
    const body = req.body as Partial<ClaudeOrchestrationPayload>;

    // Validate required fields based on type
    if (!body.type) {
      return Promise.reject(new Error('Invalid payload: missing type field'));
    }

    // For orchestration-related types, project is required
    if (['orchestrate', 'coordinate', 'session'].includes(body.type)) {
      if (!body.project?.repository || !body.project.requirements) {
        return Promise.reject(new Error('Invalid payload: missing required project fields'));
      }
    }

    // For session.create, check for session field
    if (body.type === 'session.create' && !body.session) {
      return Promise.reject(new Error('Invalid payload: missing session field'));
    }

    // Create the orchestration payload
    const orchestrationPayload: ClaudeOrchestrationPayload = {
      type: body.type,
      project: body.project,
      strategy: body.strategy,
      sessionId: body.sessionId,
      parentSessionId: body.parentSessionId,
      dependencies: body.dependencies,
      sessionType: body.sessionType,
      autoStart: body.autoStart,
      session: body.session
    };

    // Wrap in webhook payload format
    const payload: ClaudeWebhookPayload = {
      id: `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      event: body.type,
      source: 'claude',
      data: orchestrationPayload
    };

    return Promise.resolve(payload);
  }

  /**
   * Get the event type from the payload
   */
  getEventType(payload: ClaudeWebhookPayload): string {
    return payload.event;
  }

  /**
   * Get a human-readable description of the event
   */
  getEventDescription(payload: ClaudeWebhookPayload): string {
    const data = payload.data;
    switch (data.type) {
      case 'orchestrate':
        return `Orchestrate Claude sessions for ${data.project?.repository ?? 'unknown'}`;
      case 'session':
        return `Manage Claude session ${data.sessionId ?? 'new'}`;
      case 'coordinate':
        return `Coordinate Claude sessions for ${data.project?.repository ?? 'unknown'}`;
      case 'session.create':
        return `Create new Claude session`;
      case 'session.get':
        return `Get Claude session ${data.sessionId ?? 'unknown'}`;
      case 'session.list':
        return `List Claude sessions`;
      case 'session.start':
        return `Start Claude session ${data.sessionId ?? 'unknown'}`;
      case 'session.output':
        return `Get output for Claude session ${data.sessionId ?? 'unknown'}`;
      default:
        return `Unknown Claude event type: ${data.type}`;
    }
  }
}
