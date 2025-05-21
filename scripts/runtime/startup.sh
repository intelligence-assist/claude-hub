#!/bin/bash

echo "Starting Claude GitHub webhook service..."

# Build the Claude Code runner image
echo "Building Claude Code runner image..."
if docker build -f Dockerfile.claudecode -t claude-code-runner:latest .; then
    echo "Claude Code runner image built successfully."
else
    echo "Warning: Failed to build Claude Code runner image. Service will attempt to build on first use."
fi

# Start the webhook service
echo "Starting webhook service..."
exec node src/index.js