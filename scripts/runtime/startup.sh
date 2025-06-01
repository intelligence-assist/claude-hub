#!/bin/bash

echo "Starting Claude GitHub webhook service..."

# Build the Claude Code runner image if we have access to Dockerfile.claudecode
if [ -f "Dockerfile.claudecode" ]; then
    echo "Building Claude Code runner image..."
    if docker build -f Dockerfile.claudecode -t claude-code-runner:latest .; then
        echo "Claude Code runner image built successfully."
    else
        echo "Warning: Failed to build Claude Code runner image. Service will attempt to build on first use."
    fi
else
    echo "Dockerfile.claudecode not found, skipping Claude Code runner image build."
fi

# In production, dist directory is already built in the Docker image
if [ ! -d "dist" ]; then
    echo "Error: dist directory not found. Please rebuild the Docker image."
    exit 1
fi

# Start the webhook service
echo "Starting webhook service..."
exec node dist/index.js