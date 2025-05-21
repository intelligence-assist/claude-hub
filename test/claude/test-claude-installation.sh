#!/bin/bash
echo "Checking Claude installation..."

docker run --rm \
  --entrypoint /bin/bash \
  claude-code-runner:latest \
  -c "echo '=== As root ==='; which claude; claude --version 2>&1 || echo 'Error: $?'; echo '=== As node user ==='; sudo -u node which claude; sudo -u node claude --version 2>&1 || echo 'Error: $?'; echo '=== Check PATH ==='; echo \$PATH; echo '=== Check npm global ==='; ls -la /usr/local/share/npm-global/bin/; echo '=== Check node user config ==='; ls -la /home/node/.claude/"