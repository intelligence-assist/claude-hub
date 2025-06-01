#!/bin/bash
set -e

# Claude Interactive Authentication Setup Script
# This script creates a container for interactive Claude authentication

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AUTH_OUTPUT_DIR="${CLAUDE_HUB_DIR:-$HOME/.claude-hub}"

echo "🔧 Claude Interactive Authentication Setup"
echo "========================================="
echo ""

# Create output directory for authentication state
mkdir -p "$AUTH_OUTPUT_DIR"

echo "📦 Building Claude setup container..."
docker build -f "$PROJECT_ROOT/Dockerfile.claude-setup" -t claude-setup:latest "$PROJECT_ROOT"

echo ""
echo "🚀 Starting Claude authentication..."
echo ""
echo "What happens next:"
echo "  1. Claude will open your browser for authentication"
echo "  2. Complete the authentication in your browser"
echo "  3. Return here when done - the container will exit automatically"
echo ""
read -p "Press Enter to start authentication..."

# Run the container with automatic authentication
docker run -it --rm \
  -v "$AUTH_OUTPUT_DIR:/auth-output" \
  -v "$HOME/.gitconfig:/home/node/.gitconfig:ro" \
  --name claude-auth-setup \
  claude-setup:latest --auto

# Capture the exit code
DOCKER_EXIT_CODE=$?

echo ""
echo "📋 Checking authentication output..."

# First check if docker command failed
if [ $DOCKER_EXIT_CODE -ne 0 ]; then
  echo "❌ Authentication process failed (exit code: $DOCKER_EXIT_CODE)"
  echo ""
  echo "Please check the error messages above and try again."
  exit 1
fi

# Check if authentication was successful
if [ -f "$AUTH_OUTPUT_DIR/.credentials.json" ]; then
  # Get file size
  FILE_SIZE=$(stat -f%z "$AUTH_OUTPUT_DIR/.credentials.json" 2>/dev/null || stat -c%s "$AUTH_OUTPUT_DIR/.credentials.json" 2>/dev/null || echo "0")
  
  # Check if file has reasonable content (at least 100 bytes for a valid JSON)
  if [ "$FILE_SIZE" -gt 100 ]; then
    # Check if file was written recently (within last 5 minutes)
    if [ "$(find "$AUTH_OUTPUT_DIR/.credentials.json" -mmin -5 2>/dev/null)" ]; then
      echo "✅ Success! Your Claude authentication is saved."
      echo ""
      echo "The webhook service will use this automatically when you run:"
      echo "  docker compose up -d"
      echo ""
      exit 0
    else
      echo "⚠️  Found old authentication files. The authentication may not have completed."
      echo "Please run the setup again to refresh your authentication."
      exit 1
    fi
  else
    echo "❌ Authentication file is too small (${FILE_SIZE} bytes). The authentication did not complete."
    echo ""
    echo "Common causes:"
    echo "  - Browser authentication was cancelled"
    echo "  - Network connection issues"
    echo "  - Claude Code subscription not active"
    echo ""
    echo "Please run the setup again and complete the browser authentication."
    exit 1
  fi
else
  echo "❌ Authentication failed - no credentials were saved."
  echo ""
  echo "This can happen if:"
  echo "  - The browser authentication was not completed"
  echo "  - The container exited before authentication finished"
  echo "  - There was an error during the authentication process"
  echo ""
  echo "Please run './scripts/setup/setup-claude-interactive.sh' again."
  exit 1
fi

