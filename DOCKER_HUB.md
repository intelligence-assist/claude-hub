# Docker Hub Deployment Guide

## Quick Start

Pull and run the Claude GitHub Webhook from Docker Hub:

```bash
docker pull intelligenceassist/claude-github-webhook:latest
docker run -d \
  -p 8082:3002 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e GITHUB_TOKEN=your_github_token \
  -e GITHUB_WEBHOOK_SECRET=your_webhook_secret \
  -e ANTHROPIC_API_KEY=your_anthropic_key \
  -e BOT_USERNAME=@YourBotName \
  -e AUTHORIZED_USERS=user1,user2 \
  intelligenceassist/claude-github-webhook:latest
```

## Using Docker Compose

1. Create a `.env` file with your configuration:

```env
# Required
GITHUB_TOKEN=your_github_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret
ANTHROPIC_API_KEY=your_anthropic_key

# Bot Configuration
BOT_USERNAME=@YourBotName
AUTHORIZED_USERS=user1,user2
DEFAULT_GITHUB_OWNER=your-org
DEFAULT_GITHUB_USER=your-username

# Optional: Docker Hub username (not needed for pulling)
```

2. Download the docker-compose file:

```bash
curl -O https://raw.githubusercontent.com/intelligence-assist/claude-github-webhook/main/docker-compose.publish.yml
```

3. Start the service:

```bash
docker compose -f docker-compose.publish.yml up -d
```

## Environment Variables

### Required
- `GITHUB_TOKEN`: GitHub personal access token with repo permissions
- `GITHUB_WEBHOOK_SECRET`: Secret for validating GitHub webhooks
- `ANTHROPIC_API_KEY`: Anthropic API key for Claude access

### Bot Configuration
- `BOT_USERNAME`: GitHub username the bot responds to (default: `@ClaudeBot`)
- `AUTHORIZED_USERS`: Comma-separated list of authorized GitHub usernames
- `DEFAULT_GITHUB_OWNER`: Default repository owner
- `DEFAULT_GITHUB_USER`: Default GitHub user
- `DEFAULT_BRANCH`: Default branch name (default: `main`)

### Container Settings
- `CLAUDE_USE_CONTAINERS`: Enable container execution (default: `1`)
- `CLAUDE_CONTAINER_IMAGE`: Claude container image (default: `claudecode:latest`)

## GitHub Webhook Configuration

1. Go to your repository settings → Webhooks
2. Add webhook:
   - **Payload URL**: `http://your-server:8082/api/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Same as `GITHUB_WEBHOOK_SECRET`
   - **Events**: Select "Issue comments" and "Pull request reviews"

## Security Notes

- The container requires Docker socket access for Claude container execution
- Use secrets management for sensitive environment variables in production
- Consider using Docker secrets or a secrets manager instead of plain environment variables

## Building Claude Code Container

The webhook uses a separate Claude Code container for execution. Build it with:

```bash
docker build -f Dockerfile.claudecode -t claudecode:latest .
```

Or pull a pre-built version if available.

## Troubleshooting

### Check logs
```bash
docker logs <container_id>
```

### Test webhook endpoint
```bash
curl http://localhost:8082/health
```

### Verify webhook delivery
Check GitHub webhook settings for recent deliveries and responses.

## Updates

Pull the latest version:
```bash
docker pull intelligenceassist/claude-github-webhook:latest
docker compose -f docker-compose.publish.yml down
docker compose -f docker-compose.publish.yml up -d
```