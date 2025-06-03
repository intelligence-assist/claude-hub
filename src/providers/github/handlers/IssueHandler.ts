import { createLogger } from '../../../utils/logger';
import { processCommand } from '../../../services/claudeService';
import { addLabelsToIssue, getFallbackLabels } from '../../../services/githubService';
import type {
  WebhookEventHandler,
  WebhookContext,
  WebhookHandlerResponse
} from '../../../types/webhook';
import type { GitHubWebhookEvent } from '../GitHubWebhookProvider';
import type { GitHubIssue } from '../../../types/github';

const logger = createLogger('IssueHandler');

/**
 * Handler for GitHub issue.opened events (auto-tagging)
 */
export class IssueOpenedHandler implements WebhookEventHandler<GitHubWebhookEvent> {
  event = 'issues.opened';
  priority = 100;

  async handle(
    payload: GitHubWebhookEvent,
    context: WebhookContext
  ): Promise<WebhookHandlerResponse> {
    try {
      const githubPayload = payload.data as {
        issue: GitHubIssue;
        repository: { full_name: string; owner: { login: string }; name: string };
      };
      const issue = githubPayload.issue;
      const repo = githubPayload.repository;

      // Repository data is always present in GitHub webhook payloads

      logger.info(
        {
          repo: repo.full_name,
          issue: issue.number,
          title: issue.title,
          user: issue.user.login
        },
        'Processing new issue for auto-tagging'
      );

      // Create the tagging command for Claude
      const tagCommand = `Analyze this GitHub issue and apply appropriate labels using GitHub CLI commands.

Issue Details:
- Title: ${issue.title}
- Description: ${issue.body ?? 'No description provided'}
- Issue Number: ${issue.number}

Instructions:
1. First run 'gh label list' to see what labels are available in this repository
2. Analyze the issue content to determine appropriate labels from these categories:
   - Priority: critical, high, medium, low  
   - Type: bug, feature, enhancement, documentation, question, security
   - Complexity: trivial, simple, moderate, complex
   - Component: api, frontend, backend, database, auth, webhook, docker
3. Apply the labels using: gh issue edit ${issue.number} --add-label "label1,label2,label3"
4. Do NOT comment on the issue - only apply labels silently

Complete the auto-tagging task using only GitHub CLI commands.`;

      // Process with Claude
      const claudeResponse = await processCommand({
        repoFullName: repo.full_name,
        issueNumber: issue.number,
        command: tagCommand,
        isPullRequest: false,
        branchName: null,
        operationType: 'auto-tagging'
      });

      // Check if Claude succeeded
      if (claudeResponse.includes('error') || claudeResponse.includes('failed')) {
        logger.warn(
          {
            repo: repo.full_name,
            issue: issue.number,
            responsePreview: claudeResponse.substring(0, 200)
          },
          'Claude CLI tagging may have failed, attempting fallback'
        );

        // Fall back to basic tagging
        const fallbackLabels = getFallbackLabels(issue.title, issue.body);
        if (fallbackLabels.length > 0) {
          await addLabelsToIssue({
            repoOwner: repo.owner.login,
            repoName: repo.name,
            issueNumber: issue.number,
            labels: fallbackLabels
          });
          logger.info('Applied fallback labels successfully');
        }
      }

      return {
        success: true,
        message: 'Issue auto-tagged successfully',
        data: {
          repo: repo.full_name,
          issue: issue.number
        }
      };
    } catch (error) {
      logger.error(
        {
          err: error,
          context
        },
        'Error processing issue for auto-tagging'
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to auto-tag issue'
      };
    }
  }
}
