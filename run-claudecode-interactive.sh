#!/bin/bash

# Run claudecode container interactively for testing and debugging
docker run -it --rm \
  -v $(pwd):/workspace \
  -v ~/.aws:/root/.aws:ro \
  -v ~/.claude:/root/.claude \
  -w /workspace \
  --entrypoint /bin/bash \
  claudecode:latest