#!/bin/bash
echo "Testing basic container functionality..."

# Test without any special environment vars to bypass entrypoint
docker run --rm \
  --entrypoint /bin/bash \
  claude-code-runner:latest \
  -c "echo 'Container works' && ls -la /home/node/"

echo "Testing AWS credentials volume mount..."  
docker run --rm \
  -v $HOME/.aws:/home/node/.aws:ro \
  --entrypoint /bin/bash \
  claude-code-runner:latest \
  -c "ls -la /home/node/.aws/"