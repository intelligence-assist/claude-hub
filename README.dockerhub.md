# Claude GitHub Webhook

A webhook service that enables Claude AI to respond to GitHub mentions and execute commands within repository contexts.

## Quick Start

```bash
docker pull intelligenceassist/claude-hub:latest

docker run -d \
  -p 8082:3002 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e GITHUB_TOKEN=your_github_token \
  -e GITHUB_WEBHOOK_SECRET=your_webhook_secret \
  -e ANTHROPIC_API_KEY=your_anthropic_key \
  -e BOT_USERNAME=@YourBotName \
  -e AUTHORIZED_USERS=user1,user2 \
  intelligenceassist/claude-hub:latest
```

## Features

- 🤖 Responds to GitHub mentions in issues and PRs
- 🔧 Executes Claude Code in isolated containers
- 🏷️ Auto-tags issues based on content analysis
- 🔍 Automated PR reviews when checks pass
- 🔒 Secure webhook signature verification
- 📊 Health check endpoint for monitoring

## Docker Compose

```yaml
version: '3.8'

services:
  claude-webhook:
    image: intelligenceassist/claude-hub:latest
    ports:
      - "8082:3002"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - BOT_USERNAME=@YourBotName
      - AUTHORIZED_USERS=user1,user2
    restart: unless-stopped
```

## Environment Variables

### Required
- `GITHUB_TOKEN` - GitHub personal access token
- `GITHUB_WEBHOOK_SECRET` - Secret for webhook validation
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude

### Optional
- `BOT_USERNAME` - Bot mention trigger (default: @ClaudeBot)
- `AUTHORIZED_USERS` - Comma-separated authorized users
- `CLAUDE_USE_CONTAINERS` - Enable container mode (default: 1)
- `PORT` - Server port (default: 3002)

## GitHub Setup

1. Go to **Settings → Webhooks** in your repository
2. Add webhook:
   - **Payload URL**: `http://your-server:8082/api/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Same as `GITHUB_WEBHOOK_SECRET`
   - **Events**: Issues, Issue comments, Pull requests

## Usage

Mention your bot in any issue or PR comment:
```
@YourBotName Can you analyze this code and suggest improvements?
```

## Tags

- `latest` - Most recent stable version
- `0.1.0` - Initial release

## Links

- [GitHub Repository](https://github.com/intelligence-assist/claude-hub)
- [Documentation](https://github.com/intelligence-assist/claude-hub/tree/main/docs)
- [Issue Tracker](https://github.com/intelligence-assist/claude-hub/issues)

## License

MIT