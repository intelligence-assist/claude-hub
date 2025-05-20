#!/bin/bash
echo "Testing Claude without firewall..."

docker run --rm \
  -v $HOME/.aws:/home/node/.aws:ro \
  --entrypoint /bin/bash \
  claude-code-runner:latest \
  -c "cd /workspace && export HOME=/home/node && export PATH=/usr/local/share/npm-global/bin:\$PATH && export AWS_PROFILE=claude-webhook && export AWS_REGION=us-east-2 && export AWS_CONFIG_FILE=/home/node/.aws/config && export AWS_SHARED_CREDENTIALS_FILE=/home/node/.aws/credentials && export CLAUDE_CODE_USE_BEDROCK=1 && export ANTHROPIC_MODEL=us.anthropic.claude-3-7-sonnet-20250219-v1:0 && claude --print 'Hello world' 2>&1"