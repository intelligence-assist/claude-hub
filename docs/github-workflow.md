# GitHub Workflow with Claude Webhook

This document describes how the GitHub webhook integration works with Claude Code CLI.

## Overview

When someone mentions the configured bot (via BOT_USERNAME environment variable) in a GitHub issue or pull request comment, the following workflow is triggered:

1. GitHub sends a webhook to our service
2. The service validates the webhook signature
3. If valid, it extracts the command after the bot username
4. A Docker container is spun up with Claude Code CLI
5. The repository is cloned and the correct branch is checked out
6. Claude Code executes the command with full GitHub CLI access
7. The response is returned via the webhook HTTP response (not posted as a GitHub comment)

## Architecture

```
GitHub Issue/PR Comment
    ↓
GitHub Webhook
    ↓
Node.js Webhook Service
    ↓
Docker Container (Claude Code + GitHub CLI)
    ↓
HTTP Response (JSON with Claude's response)
```

## Container Environment

Each request runs in an isolated Docker container with:
- Claude Code CLI
- GitHub CLI (authenticated)
- Git (with proper credentials)
- AWS CLI (for Bedrock access)

## Supported Events

- **Issue Comments**: When the bot is mentioned in an issue comment
- **Pull Request Comments**: When the bot is mentioned in a PR comment
- **Pull Request Review Comments**: When the bot is mentioned in a PR review

## Authentication

The following credentials are required:
- `GITHUB_TOKEN`: For repository access and API calls
- AWS credentials: For Claude Code Bedrock access
- `GITHUB_WEBHOOK_SECRET`: For webhook signature verification

## Example Usage

In a GitHub issue or PR comment:

```
@ClaudeBot Please analyze the performance of the current implementation and suggest optimizations.
```

Claude will:
1. Clone the repository
2. Checkout the appropriate branch (main for issues, PR branch for PRs)
3. Analyze the code
4. Return the response via the webhook HTTP response with suggestions

## Available Claude Commands

Claude Code has access to:
- File operations (Read, Write, Edit)
- Git operations
- GitHub CLI for:
  - Creating/updating issues
  - Managing pull requests
  - Adding comments
  - Reviewing code
  - Approving/requesting changes

## Configuration

Environment variables required:
- `GITHUB_TOKEN`: GitHub personal access token with repo access
- `GITHUB_WEBHOOK_SECRET`: Secret for webhook verification
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `AWS_REGION`: AWS region (default: us-east-1)
- `CLAUDE_CODE_USE_BEDROCK`: Set to "1" to use Bedrock
- `ANTHROPIC_MODEL`: Model to use (e.g., claude-3-sonnet-20241022)