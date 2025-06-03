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

    // Validate required fields
    if (!body.type || !body.project?.repository || !body.project.requirements) {
      throw new Error('Invalid payload: missing required fields');
    }

    // Create the orchestration payload
    const orchestrationPayload: ClaudeOrchestrationPayload = {
      type: body.type,
      project: body.project,
      strategy: body.strategy,
      sessionId: body.sessionId,
      parentSessionId: body.parentSessionId,
      dependencies: body.dependencies
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
        return `Orchestrate Claude sessions for ${data.project.repository}`;
      case 'session':
        return `Manage Claude session ${data.sessionId ?? 'new'}`;
      case 'coordinate':
        return `Coordinate Claude sessions for ${data.project.repository}`;
      default:
        return `Unknown Claude event type: ${data.type}`;
    }
  }
}
