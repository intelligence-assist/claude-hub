#!/bin/bash
# Build the Claude Code runner Docker image

echo "Building Claude Code runner Docker image..."
docker build -f Dockerfile.claudecode -t claudecode:latest .

# Also tag it with the old name for backward compatibility
docker tag claudecode:latest claude-code-runner:latest

echo "Build complete!"
echo "Image tagged as:"
echo "  - claudecode:latest (primary)"
echo "  - claude-code-runner:latest (backward compatibility)"