#!/bin/bash
echo "Testing full entrypoint flow..."

docker run --rm -i \
  -v $HOME/.aws:/home/node/.aws:ro \
  -e REPO_FULL_NAME="${TEST_REPO_FULL_NAME:-owner/repo}" \
  -e ISSUE_NUMBER="1" \
  -e IS_PULL_REQUEST="false" \
  -e COMMAND="echo 'test'" \
  -e GITHUB_TOKEN="${GITHUB_TOKEN:-dummy-token}" \
  -e AWS_PROFILE="claude-webhook" \
  -e AWS_REGION="us-east-2" \
  -e CLAUDE_CODE_USE_BEDROCK="1" \
  -e ANTHROPIC_MODEL="us.anthropic.claude-3-7-sonnet-20250219-v1:0" \
  claude-code-runner:latest