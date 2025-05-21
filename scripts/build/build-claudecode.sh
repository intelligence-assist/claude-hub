#!/bin/bash
# Build the Claude Code runner Docker image

echo "Building Claude Code runner Docker image..."
docker build -f Dockerfile.claudecode -t claude-code-runner:latest .

echo "Build complete!"