#!/bin/bash
echo "Testing if Claude executable runs..."

docker run --rm \
  --entrypoint /bin/bash \
  claude-code-runner:latest \
  -c "cd /workspace && /usr/local/share/npm-global/bin/claude --version 2>&1 || echo 'Exit code: $?'"