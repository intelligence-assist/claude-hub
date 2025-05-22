# Automated PR Review Workflow

This document describes the automated pull request review workflow that triggers when all CI checks pass on a PR.

## Overview

The Claude GitHub webhook service automatically reviews pull requests when all status checks complete successfully. This helps maintain code quality by providing consistent, thorough reviews without manual intervention.

## Workflow Sequence

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant WH as Webhook Service
    participant GS as GitHub Service
    participant CS as Claude Service
    participant DC as Docker Container

    Note over GH: PR checks complete
    GH->>WH: check_suite webhook<br/>(action: completed)
    WH->>WH: Verify webhook signature
    WH->>WH: Check if conclusion = success
    
    alt No PRs in check_suite
        WH->>GH: 200 OK<br/>"Webhook processed"
    else Has PRs
        loop For each PR
            WH->>GS: getCombinedStatus(sha)
            GS->>GH: GET /repos/:owner/:repo/commits/:sha/status
            GH->>GS: Combined status response
            GS->>WH: Status state & count
            
            alt Status != success
                WH->>WH: Skip this PR<br/>(log reason)
            else Status = success
                WH->>CS: processCommand()<br/>(PR review prompt)
                CS->>DC: Spawn Claude container
                DC->>DC: Clone repository
                DC->>DC: Checkout PR branch
                DC->>GH: gh pr view
                DC->>GH: gh pr diff
                DC->>DC: Analyze code changes
                DC->>GH: gh pr comment<br/>(line comments)
                DC->>GH: gh pr review<br/>(approve/request changes)
                DC->>CS: Review complete
                CS->>WH: Response
            end
        end
        WH->>GH: 200 OK<br/>"PR review triggered"
    end
```

## Detailed Flow

### 1. Webhook Receipt

```mermaid
flowchart TD
    A[GitHub check_suite event] --> B{Event type?}
    B -->|check_suite| C{Action = completed?}
    B -->|Other| D[Process other events]
    C -->|No| E[Skip processing]
    C -->|Yes| F{Conclusion = success?}
    F -->|No| G[Log skip reason]
    F -->|Yes| H{Has pull_requests?}
    H -->|No| I[Check for head_branch]
    H -->|Yes| J[Process each PR]
    I -->|Has branch| K[Log warning - possible fork]
    I -->|No branch| L[Return success]
```

### 2. PR Status Verification

```mermaid
flowchart TD
    A[For each PR] --> B[Get commit SHA]
    B --> C{SHA available?}
    C -->|No| D[Log error & skip]
    C -->|Yes| E[Call GitHub API]
    E --> F[Get combined status]
    F --> G{All checks passed?}
    G -->|No| H[Skip PR review]
    G -->|Yes| I[Trigger Claude review]
```

### 3. Claude Review Process

```mermaid
flowchart TD
    A[Prepare review prompt] --> B[Launch Claude container]
    B --> C[Clone repository]
    C --> D[Checkout PR branch]
    D --> E[Analyze PR details]
    E --> F[Review code changes]
    F --> G{Issues found?}
    G -->|Yes| H[Add line comments]
    G -->|No| I[Skip comments]
    H --> J[Create review summary]
    I --> J
    J --> K{Approve PR?}
    K -->|Yes| L[gh pr review --approve]
    K -->|No| M[gh pr review --request-changes]
    L --> N[Return response]
    M --> N
```

## Key Components

### GitHub Controller (`githubController.js`)

Handles incoming webhooks and orchestrates the review process:

```javascript
// Webhook handler for check_suite events
if (event === 'check_suite' && payload.action === 'completed') {
  const checkSuite = payload.check_suite;
  
  // Only process successful check suites with PRs
  if (checkSuite.conclusion === 'success' && 
      checkSuite.pull_requests?.length > 0) {
    
    for (const pr of checkSuite.pull_requests) {
      // Verify all status checks passed
      const combinedStatus = await githubService.getCombinedStatus({
        repoOwner: repo.owner.login,
        repoName: repo.name,
        ref: pr.head?.sha || checkSuite.head_sha
      });
      
      if (combinedStatus.state === 'success') {
        // Trigger Claude review
        await claudeService.processCommand({
          repoFullName: repo.full_name,
          issueNumber: pr.number,
          command: prReviewPrompt,
          isPullRequest: true,
          branchName: pr.head.ref
        });
      }
    }
  }
}
```

### GitHub Service (`githubService.js`)

Interfaces with GitHub API to check PR status:

```javascript
async function getCombinedStatus({ repoOwner, repoName, ref }) {
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/commits/${ref}/status`;
  
  const response = await axios.get(url, {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json'
    }
  });
  
  return {
    state: response.data.state, // success, pending, failure
    total_count: response.data.total_count,
    statuses: response.data.statuses
  };
}
```

### Claude Service (`claudeService.js`)

Manages Claude container execution:

```javascript
async function processCommand({ repoFullName, issueNumber, command, isPullRequest, branchName }) {
  // Spawn privileged container with Claude
  const container = await docker.run('claudecode', {
    env: {
      REPO_FULL_NAME: repoFullName,
      ISSUE_NUMBER: issueNumber,
      IS_PULL_REQUEST: isPullRequest,
      BRANCH_NAME: branchName
    },
    privileged: true,
    capabilities: ['NET_ADMIN', 'NET_RAW', 'SYS_ADMIN']
  });
  
  // Execute review command
  const result = await container.exec(['claude', 'review', '--pr', issueNumber]);
  return result;
}
```

## Configuration

### Required Environment Variables

- `GITHUB_TOKEN`: GitHub personal access token with repo and workflow permissions
- `GITHUB_WEBHOOK_SECRET`: Secret for validating webhook payloads
- `BOT_USERNAME`: GitHub username that triggers reviews (e.g., `@ClaudeBot`)
- `ANTHROPIC_API_KEY`: API key for Claude access

### GitHub Webhook Configuration

1. Go to repository Settings → Webhooks
2. Add webhook with URL: `https://your-domain/api/webhooks/github`
3. Content type: `application/json`
4. Secret: Use the value from `GITHUB_WEBHOOK_SECRET`
5. Events to trigger:
   - Check suites
   - Pull requests (optional, for manual triggers)
   - Issue comments (for manual triggers via mentions)

## Review Process Details

### What Claude Reviews

1. **Security vulnerabilities**
   - SQL injection risks
   - XSS vulnerabilities
   - Authentication/authorization issues
   - Sensitive data exposure

2. **Code quality**
   - Logic errors and edge cases
   - Performance issues
   - Code organization and readability
   - Error handling completeness

3. **Best practices**
   - Design patterns usage
   - Testing coverage
   - Documentation quality
   - Dependency management

### Review Output

Claude provides feedback through:

1. **Line comments**: Specific issues on exact code lines
2. **General comments**: Overall observations and suggestions
3. **Review decision**: 
   - ✅ Approve: Code meets quality standards
   - 🔄 Request changes: Issues need addressing
   - 💬 Comment: Observations without blocking

## Troubleshooting

### PR Review Not Triggering

```mermaid
flowchart TD
    A[Review not triggered] --> B{Check logs}
    B --> C{Webhook received?}
    C -->|No| D[Verify webhook config]
    C -->|Yes| E{check_suite event?}
    E -->|No| F[Wrong event type]
    E -->|Yes| G{Action = completed?}
    G -->|No| H[Waiting for completion]
    G -->|Yes| I{Conclusion = success?}
    I -->|No| J[Checks failed]
    I -->|Yes| K{PRs in payload?}
    K -->|No| L[No PRs associated]
    K -->|Yes| M{Combined status = success?}
    M -->|No| N[Some checks pending/failed]
    M -->|Yes| O[Check Claude service logs]
```

### Common Issues

1. **Missing pull_requests in webhook payload**
   - Usually occurs with PRs from forks
   - GitHub may not include PR data in check_suite events for security

2. **Combined status shows pending**
   - Some required checks haven't completed
   - Check GitHub PR page for status details

3. **Authentication errors**
   - Verify GITHUB_TOKEN has correct permissions
   - Ensure token hasn't expired

4. **Container execution failures**
   - Check Docker daemon is running
   - Verify Claude container image exists
   - Ensure sufficient permissions for privileged containers

## Testing

### Manual Testing

1. Create a test PR with passing checks
2. Monitor webhook logs: `docker compose logs -f webhook`
3. Verify review appears on PR

### Automated Testing

```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Test specific webhook handling
npm test -- --testPathPattern=githubController-check-suite
```

## Performance Considerations

- Each PR review spawns a new container (isolation)
- Reviews run sequentially within a check_suite
- Typical review time: 30-60 seconds per PR
- Container cleanup happens automatically

## Security Notes

1. **Webhook validation**: All webhooks are verified using HMAC-SHA256
2. **Token storage**: Use secure credential management (not env vars in production)
3. **Container isolation**: Each review runs in an isolated container
4. **Network policies**: Containers have restricted network access
5. **Code execution**: Claude only analyzes, doesn't execute PR code

## Future Enhancements

- [ ] Parallel PR reviews for multiple PRs
- [ ] Caching for faster repository cloning
- [ ] Custom review rules per repository
- [ ] Review quality metrics and analytics
- [ ] Integration with other CI/CD tools