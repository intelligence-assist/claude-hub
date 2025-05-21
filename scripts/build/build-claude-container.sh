#!/bin/bash

# Build the Claude Code container
echo "Building Claude Code container..."
docker build -t claudecode:latest -f Dockerfile.claude .

echo "Container built successfully. You can run it with:"
echo "docker run --rm claudecode:latest \"claude --help\""

# Enable container mode in the .env file if it's not already set
if ! grep -q "CLAUDE_USE_CONTAINERS=1" .env 2>/dev/null; then
  echo ""
  echo "Enabling container mode in .env file..."
  echo "CLAUDE_USE_CONTAINERS=1" >> .env
  echo "CLAUDE_CONTAINER_IMAGE=claudecode:latest" >> .env
  echo "Container mode enabled in .env file"
fi

echo ""
echo "Done! You can now use the Claude API with container mode."
echo "To test it, run:"
echo "node test-claude-api.js owner/repo container \"Your command here\"" 