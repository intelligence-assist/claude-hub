# Environment Variables Documentation

This document provides a comprehensive list of all environment variables used in the Claude GitHub Webhook project.

## Table of Contents
- [Core Application Configuration](#core-application-configuration)
- [Bot Configuration](#bot-configuration)
- [GitHub Configuration](#github-configuration)
- [Claude/Anthropic Configuration](#claudeanthropic-configuration)
- [Container Configuration](#container-configuration)
- [AWS Configuration](#aws-configuration)
- [PR Review Configuration](#pr-review-configuration)
- [Security & Secrets Configuration](#security--secrets-configuration)
- [Rate Limiting Configuration](#rate-limiting-configuration)
- [Health Check Configuration](#health-check-configuration)
- [Development/Test Variables](#developmenttest-variables)
- [Shell Script Variables](#shell-script-variables)
- [Hard-coded Values That Could Be Configurable](#hard-coded-values-that-could-be-configurable)

## Core Application Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Application environment (development/production/test) | `development` | No |
| `PORT` | Server port | `3002` | No |
| `TRUST_PROXY` | Trust proxy headers for X-Forwarded-For | `false` | No |

## Bot Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BOT_USERNAME` | GitHub username the bot responds to (e.g., @ClaudeBot) | - | Yes |
| `BOT_EMAIL` | Email used for git commits by the bot | - | Yes |
| `DEFAULT_AUTHORIZED_USER` | Default authorized GitHub username | - | No |
| `AUTHORIZED_USERS` | Comma-separated list of authorized GitHub usernames | - | No |

## GitHub Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GITHUB_TOKEN` | GitHub personal access token | - | Yes |
| `GITHUB_WEBHOOK_SECRET` | Secret for validating GitHub webhook payloads | - | Yes |
| `DEFAULT_GITHUB_OWNER` | Default GitHub organization/owner | - | No |
| `DEFAULT_GITHUB_USER` | Default GitHub username | - | No |
| `DEFAULT_BRANCH` | Default git branch | `main` | No |
| `TEST_REPO_FULL_NAME` | Test repository in owner/repo format | - | No |

## Claude/Anthropic Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude access | - | Yes* |
| `ANTHROPIC_MODEL` | Model name | `us.anthropic.claude-3-7-sonnet-20250219-v1:0` | No |
| `CLAUDE_CODE_USE_BEDROCK` | Whether to use AWS Bedrock for Claude (0/1) | `0` | No |
| `CLAUDE_HUB_DIR` | Directory for Claude Hub config | `~/.claude-hub` | No |
| `CLAUDE_AUTH_HOST_DIR` | Host directory for Claude authentication | - | No |

*Required unless using AWS Bedrock or setup container authentication

## Container Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CLAUDE_USE_CONTAINERS` | Enable container execution (0/1) | `1` | No |
| `CLAUDE_CONTAINER_IMAGE` | Docker image for Claude containers | `claudecode:latest` | No |
| `CLAUDE_CONTAINER_PRIVILEGED` | Run containers in privileged mode | `false` | No |
| `CLAUDE_CONTAINER_CAP_NET_RAW` | Add NET_RAW capability | `true` | No |
| `CLAUDE_CONTAINER_CAP_SYS_TIME` | Add SYS_TIME capability | `false` | No |
| `CLAUDE_CONTAINER_CAP_DAC_OVERRIDE` | Add DAC_OVERRIDE capability | `true` | No |
| `CLAUDE_CONTAINER_CAP_AUDIT_WRITE` | Add AUDIT_WRITE capability | `true` | No |
| `CLAUDE_CONTAINER_CPU_SHARES` | CPU shares for containers | `1024` | No |
| `CLAUDE_CONTAINER_MEMORY_LIMIT` | Memory limit for containers | `2g` | No |
| `CLAUDE_CONTAINER_PIDS_LIMIT` | Process limit for containers | `256` | No |
| `CONTAINER_LIFETIME_MS` | Container execution timeout in milliseconds | `7200000` (2 hours) | No |
| `REPO_CACHE_DIR` | Directory for repository cache | `/tmp/repo-cache` | No |
| `REPO_CACHE_MAX_AGE_MS` | Max age for cached repos in milliseconds | `3600000` (1 hour) | No |

## Claude Code Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BASH_DEFAULT_TIMEOUT_MS` | Default timeout for bash commands in Claude Code | `600000` (10 minutes) | No |
| `BASH_MAX_TIMEOUT_MS` | Maximum timeout Claude can set for bash commands | `1200000` (20 minutes) | No |

## AWS Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AWS_ACCESS_KEY_ID` | AWS access key ID | - | No* |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key | - | No* |
| `AWS_SESSION_TOKEN` | AWS session token (for temporary credentials) | - | No |
| `AWS_SECURITY_TOKEN` | Alternative name for session token | - | No |
| `AWS_REGION` | AWS region | `us-east-1` | No |
| `AWS_PROFILE` | AWS profile name | - | No |
| `USE_AWS_PROFILE` | Use AWS profile instead of direct credentials | `false` | No |
| `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` | ECS container credentials URI | - | No |

*Required if using AWS Bedrock for Claude

## PR Review Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PR_REVIEW_WAIT_FOR_ALL_CHECKS` | Wait for all checks before PR review | `true` | No |
| `PR_REVIEW_TRIGGER_WORKFLOW` | Specific workflow name to trigger PR review | - | No |
| `PR_REVIEW_DEBOUNCE_MS` | Delay before checking all check suites | `5000` | No |
| `PR_REVIEW_MAX_WAIT_MS` | Max wait for in-progress checks | `1800000` (30 min) | No |
| `PR_REVIEW_CONDITIONAL_TIMEOUT_MS` | Timeout for conditional jobs | `300000` (5 min) | No |

## Security & Secrets Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GITHUB_TOKEN_FILE` | Path to file containing GitHub token | `/run/secrets/github_token` | No |
| `ANTHROPIC_API_KEY_FILE` | Path to file containing Anthropic API key | `/run/secrets/anthropic_api_key` | No |
| `GITHUB_WEBHOOK_SECRET_FILE` | Path to file containing webhook secret | `/run/secrets/webhook_secret` | No |
| `DISABLE_LOG_REDACTION` | Disable credential redaction in logs | `false` | No |

## Rate Limiting Configuration

These values are currently hard-coded but could be made configurable:

| Value | Description | Current Value | Location |
|-------|-------------|---------------|----------|
| Rate limit window | API rate limit time window | 15 minutes | `src/index.ts:32` |
| Rate limit max requests | Max API requests per window | 100 | `src/index.ts:41` |
| Webhook rate limit window | Webhook rate limit time window | 5 minutes | `src/index.ts:50` |
| Webhook rate limit max requests | Max webhook requests per window | 50 | `src/index.ts:51` |

## Health Check Configuration

These values are defined in docker-compose.yml:

| Value | Description | Current Value |
|-------|-------------|---------------|
| Health check interval | Time between health checks | 30s |
| Health check timeout | Timeout for each health check | 10s |
| Health check retries | Number of retries before unhealthy | 3 |
| Health check start period | Grace period on startup | 10s |

## Development/Test Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `API_URL` | API URL for testing | `http://localhost:3003` | No |
| `WEBHOOK_URL` | Webhook URL for testing | - | No |
| `CLAUDE_API_AUTH_REQUIRED` | Require auth for Claude API | `false` | No |
| `CLAUDE_API_AUTH_TOKEN` | Auth token for Claude API | - | No |
| `HOME` | User home directory | - | No |
| `WORKSPACE_PATH` | GitHub Actions workspace path | - | No |
| `GITHUB_WORKSPACE` | GitHub Actions workspace | - | No |

## Shell Script Variables

| Variable | Description | Used In |
|----------|-------------|---------|
| `ALLOWED_TOOLS` | Tools allowed for Claude execution | entrypoint scripts |
| `OPERATION_TYPE` | Type of operation (tagging, review, etc.) | entrypoint scripts |
| `PRODUCTION_BOT` | Production bot username | setup scripts |
| `STAGING_BOT` | Staging bot username | setup scripts |
| `RUNNER_TOKEN` | GitHub Actions runner token | runner scripts |

## Hard-coded Values That Could Be Configurable

The following values are currently hard-coded in the source code but could potentially be made configurable via environment variables:

### Buffer Sizes
- Docker execution buffer: 10MB (`src/services/claudeService.ts:160`)
- Container logs buffer: 1MB (`src/services/claudeService.ts:184,590`)

### External URLs
- EC2 metadata endpoint: `http://169.254.169.254/latest/meta-data/` (`src/utils/awsCredentialProvider.ts:94`)
- GitHub API meta: `https://api.github.com/meta` (`scripts/security/init-firewall.sh:32`)

### Allowed Domains (Firewall)
- `registry.npmjs.org`
- `api.anthropic.com`
- `sentry.io`
- `statsig.anthropic.com`
- `statsig.com`

### Default Values
- Default git email in containers: `claude@example.com` (`scripts/runtime/claudecode-entrypoint.sh:89`)
- Default git username in containers: `ClaudeBot` (`scripts/runtime/claudecode-entrypoint.sh:90`)
- Health check container image: `claude-code-runner:latest` (`src/index.ts:140`)

### Docker Base Images
- Node base image: `node:24` (`Dockerfile.claudecode:1`)
- Delta version: `0.18.2` (`Dockerfile.claudecode:87`)
- Zsh-in-docker version: `v1.2.0` (`Dockerfile.claudecode:91`)

## Notes

1. **Secret Files**: The application supports loading secrets from files, which takes priority over environment variables. This is more secure for production deployments.

2. **AWS Authentication**: The service supports multiple AWS authentication methods:
   - Direct credentials (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)
   - AWS profiles (AWS_PROFILE with USE_AWS_PROFILE=true)
   - Instance profiles (EC2)
   - Task roles (ECS)

3. **Container Capabilities**: The container capability flags allow fine-grained control over container permissions for security purposes.

4. **Staging Environment**: Additional environment variables are defined in `.env.staging` for staging deployments, following the pattern `VARIABLE_NAME_STAGING`.