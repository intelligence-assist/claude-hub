# Claude GitHub Webhook Container Setup

This document explains how to set up and use the Claude GitHub Webhook service with container mode.

## Overview

The Claude GitHub Webhook service can operate in two modes:
1. **Direct mode** - Runs Claude Code CLI directly on the host
2. **Container mode** - Runs Claude in isolated Docker containers (recommended for production)

Container mode provides several benefits:
- Isolation between requests
- Cleaner environment for each execution
- Better security and resource management
- Automatic repository caching for improved performance

## Requirements

- Docker
- Node.js (v14+)
- GitHub Personal Access Token (with repo scope)
- Anthropic API Key or AWS Bedrock credentials

## Setup Instructions

### 1. Environment Configuration

Create a `.env` file with the following variables:

```
# GitHub Configuration
GITHUB_TOKEN=your_github_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Claude Configuration
ANTHROPIC_API_KEY=sk-ant-yourkey

# Container Configuration
CLAUDE_USE_CONTAINERS=1
CLAUDE_CONTAINER_IMAGE=claudecode:latest
REPO_CACHE_DIR=/path/to/repo/cache
REPO_CACHE_MAX_AGE_MS=3600000

# Optional: AWS Bedrock Configuration (if not using direct Anthropic API)
CLAUDE_CODE_USE_BEDROCK=1
AWS_ACCESS_KEY_ID=your_aws_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-west-2
```

### 2. Building the Claude Container

Run the provided script to build the Claude Code container:

```bash
./build-claude-container.sh
```

This script will:
- Build the Docker container with Claude Code CLI
- Automatically update your .env file to enable container mode

### 3. Running the Service

Start the service using Docker Compose:

```bash
docker compose up -d
```

This will start the webhook service that listens for GitHub events.

### 4. Testing the Setup

You can test the Claude API directly:

```bash
node test-claude-api.js owner/repo container "Your command here"
```

## Repository Caching

The service includes automatic repository caching to improve performance:

- Repositories are cached in the directory specified by `REPO_CACHE_DIR`
- Cache expiration is controlled by `REPO_CACHE_MAX_AGE_MS` (default: 1 hour)
- Stale caches are automatically refreshed

## Security Considerations

- All GitHub tokens are passed via environment variables
- Container isolation prevents repository data from persisting between requests
- Webhook requests are verified using the GitHub webhook secret
- Test mode can be enabled using `NODE_ENV=test` or `SKIP_WEBHOOK_VERIFICATION=1`

## Troubleshooting

### Common Issues

1. **Container not found**
   - Ensure the container was built successfully
   - Check that `CLAUDE_CONTAINER_IMAGE` matches the actual image name

2. **Permission denied for repo cache**
   - Ensure the service has write permissions to `REPO_CACHE_DIR`

3. **GitHub token issues**
   - Verify your token has the `repo` scope
   - Check that the token is valid and not expired

4. **Claude API errors**
   - Verify your Anthropic API key or AWS credentials
   - Check logs for specific error messages

### Logs

Container execution logs are available through Docker:

```bash
docker compose logs -f webhook
```

For more detailed logging, set the log level in your `.env`:

```
LOG_LEVEL=debug
```