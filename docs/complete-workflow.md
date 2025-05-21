# Complete Claude GitHub Webhook Workflow

This document provides a comprehensive overview of the entire workflow from GitHub webhook reception to Claude execution and response.

## Architecture Overview

```
GitHub → Webhook Service → Docker Container → Claude API
     ↓                                   ↓
     ←←←←←← GitHub API ←←←←←←←←←←←←←←←←←
```

## Detailed Workflow

### 1. GitHub Webhook Reception

**Endpoint**: `POST /api/webhooks/github`
**Handler**: `src/index.js:38`

1. GitHub sends webhook event to the service
2. Express middleware captures raw body for signature verification
3. Request is passed to the GitHub controller

### 2. Webhook Verification & Processing

**Controller**: `src/controllers/githubController.js`
**Method**: `handleWebhook()`

1. Verifies webhook signature using `GITHUB_WEBHOOK_SECRET`
2. Parses event payload
3. Supported event types:
   - `issue_comment.created`
   - `pull_request_review_comment.created`
   - `pull_request.created`

### 3. Command Extraction

1. Checks for bot mention in comment body (using BOT_USERNAME env variable)
2. Extracts command using regex pattern based on configured bot username
3. Captures:
   - Repository full name
   - Issue/PR number
   - Branch information (if PR)
   - Command to execute

### 4. Claude Container Preparation

**Service**: `src/services/claudeService.js`
**Method**: `processCommand()`

1. Builds Docker image if not exists: `claude-code-runner:latest`
2. Creates unique container name
3. Prepares environment variables:
   ```
   GITHUB_TOKEN
   AWS_ACCESS_KEY_ID
   AWS_SECRET_ACCESS_KEY
   AWS_REGION
   ANTHROPIC_MODEL
   CLAUDE_CODE_USE_BEDROCK
   REPO_FULL_NAME
   ISSUE_NUMBER
   TARGET_BRANCH
   COMMAND
   ```

### 5. Container Execution

**Entrypoint**: `claudecode-entrypoint.sh`

1. Configure GitHub CLI authentication
2. Clone repository with GitHub token
3. Checkout appropriate branch:
   - PR branch for pull requests
   - Main/default branch for issues
4. Set git configuration for commits
5. Run Claude Code CLI with command
6. Save response to `/tmp/response.md`

### 6. Response Handling

**Controller**: `src/controllers/githubController.js`
**Method**: `handleWebhook()`

1. Read response from container
2. Return response as HTTP JSON response
3. Clean up container (if configured)

## API Endpoints

### Main Webhook Endpoint

- **URL**: `/api/webhooks/github`
- **Method**: `POST`
- **Headers**: `X-Hub-Signature-256` (GitHub webhook signature)
- **Purpose**: Receives GitHub webhook events

### Direct Claude API

- **URL**: `/api/claude`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "repository": "owner/repo",
    "useContainer": true,
    "command": "your command here"
  }
  ```
- **Purpose**: Direct Claude invocation (testing/debugging)

### Health Check

- **URL**: `/health`
- **Method**: `GET`
- **Response**: 
  ```json
  {
    "status": "OK",
    "docker": true,
    "timestamp": "2024-11-03T12:00:00.000Z"
  }
  ```
- **Purpose**: Service health monitoring

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub personal access token | `your_github_token` |
| `GITHUB_WEBHOOK_SECRET` | Webhook signature secret | `your-secret` |
| `AWS_ACCESS_KEY_ID` | AWS access key for Bedrock | `your_access_key_id` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `xxxxx` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_REGION` | AWS region for Bedrock | `us-east-1` |
| `ANTHROPIC_MODEL` | Claude model to use | `claude-3-sonnet-20241022` |
| `CLAUDE_CODE_USE_BEDROCK` | Use Bedrock (vs API) | `1` |
| `PORT` | Service port | `3002` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `CLEANUP_CONTAINERS` | Auto-cleanup after execution | `false` |

## Docker Container Lifecycle

### Build Phase

1. `Dockerfile.claudecode` defines Claude execution environment
2. Installs:
   - Node.js 18
   - GitHub CLI
   - AWS CLI
   - Claude Code CLI
   - Git and utilities

### Execution Phase

1. Container created with unique name
2. Volumes mounted:
   - `/tmp/response.md` for output
   - Project directory for access
3. Environment variables passed
4. Runs `claudecode-entrypoint.sh`

### Cleanup Phase

1. Response file extracted
2. Container stopped
3. Container removed (if cleanup enabled)
4. Volumes cleaned up

## Security Considerations

1. **Webhook Verification**: All webhooks verified with HMAC signature
2. **Container Isolation**: Each request runs in isolated container
3. **Limited Permissions**: Claude Code runs with restricted tools
4. **Token Security**: GitHub tokens never exposed in logs
5. **Network Isolation**: Containers run in isolated network

## Error Handling

1. **Webhook Errors**: Return 401 for invalid signatures
2. **Container Errors**: Caught and logged, error posted to GitHub
3. **API Errors**: Return appropriate HTTP status codes
4. **Timeout Handling**: Container execution limited to 5 minutes
5. **Cleanup Errors**: Logged but don't fail the request

## Testing

### Manual Testing

```bash
# Test webhook locally
node test-webhook-manual.js

# Test Claude API directly
node test-claude-api.js owner/repo

# Test with container
node test-claude-api.js owner/repo container "Your command"
```

### Integration Testing

```bash
# Full workflow test
npm test

# Docker container test
./test-claudecode-docker.sh
```

## Deployment

### Docker Compose

```yaml
services:
  webhook:
    build: .
    ports:
      - "8082:3002"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - n8n_default
```

### Production Considerations

1. Use environment-specific `.env` files
2. Enable container cleanup for production
3. Set appropriate resource limits
4. Configure logging for monitoring
5. Use webhook URL allowlisting

## Troubleshooting

### Common Issues

1. **Webhook Signature Failures**
   - Check `GITHUB_WEBHOOK_SECRET` matches GitHub
   - Verify raw body is captured correctly

2. **Container Build Failures**
   - Check Docker daemon is running
   - Verify Docker socket permissions

3. **Claude Errors**
   - Verify AWS credentials are valid
   - Check Bedrock model availability in region

4. **GitHub API Errors**
   - Verify `GITHUB_TOKEN` has correct permissions
   - Check rate limits

### Debug Commands

```bash
# View webhook logs
docker compose logs -f webhook

# List running containers
docker ps -a | grep claude-code

# Debug container directly
./debug-container.sh

# Check Docker connectivity
curl --unix-socket /var/run/docker.sock http://localhost/info
```