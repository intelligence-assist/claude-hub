#!/bin/bash
# Consolidated build script
# Usage: ./build.sh [claude|claudecode|production]

set -e

BUILD_TYPE=${1:-claudecode}

case "$BUILD_TYPE" in
  claude)
    echo "Building Claude container..."
    docker build -f Dockerfile.claude -t claude-container:latest .
    ;;
  
  claudecode)
    echo "Building Claude Code runner Docker image..."
    docker build -f Dockerfile.claudecode -t claude-code-runner:latest .
    ;;
  
  production)
    if [ ! -d "./claude-config" ]; then
      echo "Error: claude-config directory not found."
      echo "Please run ./scripts/setup/setup-claude-auth.sh first and copy the config."
      exit 1
    fi
    
    echo "Building production image with pre-authenticated config..."
    cp Dockerfile.claudecode Dockerfile.claudecode.backup
    # Production build logic from update-production-image.sh
    # ... (truncated for brevity)
    docker build -f Dockerfile.claudecode -t claude-code-runner:production .
    ;;
  
  *)
    echo "Unknown build type: $BUILD_TYPE"
    echo "Usage: ./build.sh [claude|claudecode|production]"
    exit 1
    ;;
esac

echo "Build complete!"
