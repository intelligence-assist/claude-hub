#!/bin/bash
echo "Testing AWS mount and profile..."

docker run --rm \
  -v $HOME/.aws:/home/node/.aws:ro \
  --entrypoint /bin/bash \
  claude-code-runner:latest \
  -c "echo '=== AWS files ==='; ls -la /home/node/.aws/; echo '=== Config content ==='; cat /home/node/.aws/config; echo '=== Test AWS profile ==='; export AWS_PROFILE=claude-webhook; export AWS_CONFIG_FILE=/home/node/.aws/config; export AWS_SHARED_CREDENTIALS_FILE=/home/node/.aws/credentials; aws sts get-caller-identity --profile claude-webhook"