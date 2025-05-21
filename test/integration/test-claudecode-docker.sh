#!/bin/bash
# Test the Claude Code Docker setup

echo "Testing Claude Code Docker setup..."

# Build the image
echo "Building Docker image..."
./build-claudecode.sh

# Test with a mock request
echo "Testing container execution..."
docker run --rm \
  -e REPO_FULL_NAME="owner/test-repo" \
  -e ISSUE_NUMBER="1" \
  -e IS_PULL_REQUEST="false" \
  -e BRANCH_NAME="" \
  -e COMMAND="echo 'Hello from Claude Code!'" \
  -e GITHUB_TOKEN="${GITHUB_TOKEN:-test-token}" \
  -e AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}" \
  -e AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}" \
  -e AWS_REGION="${AWS_REGION:-us-east-1}" \
  -e CLAUDE_CODE_USE_BEDROCK="1" \
  -e ANTHROPIC_MODEL="claude-3-sonnet-20241022" \
  claude-code-runner:latest

echo "Test complete!"