#!/bin/bash
echo "Testing Claude Code directly in container..."

docker run --rm \
  -v $HOME/.aws:/home/node/.aws:ro \
  -e AWS_PROFILE="claude-webhook" \
  -e AWS_REGION="us-east-2" \
  -e CLAUDE_CODE_USE_BEDROCK="1" \
  -e ANTHROPIC_MODEL="us.anthropic.claude-3-7-sonnet-20250219-v1:0" \
  --entrypoint /bin/bash \
  claude-code-runner:latest \
  -c "cd /workspace && export PATH=/usr/local/share/npm-global/bin:$PATH && sudo -u node -E env PATH=/usr/local/share/npm-global/bin:$PATH AWS_PROFILE=claude-webhook AWS_REGION=us-east-2 CLAUDE_CODE_USE_BEDROCK=1 ANTHROPIC_MODEL=us.anthropic.claude-3-7-sonnet-20250219-v1:0 AWS_CONFIG_FILE=/home/node/.aws/config AWS_SHARED_CREDENTIALS_FILE=/home/node/.aws/credentials claude --print 'Hello world' 2>&1"