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
echo "🚀 Starting interactive Claude authentication container..."
echo ""
echo "IMPORTANT: This will open an interactive shell where you can:"
echo "  1. Run 'claude login' to authenticate"
echo "  2. Follow the browser-based authentication flow"
echo "  3. Test with 'claude status' to verify authentication"
echo "  4. Type 'exit' when done to preserve authentication state"
echo ""
echo "The authenticated ~/.claude directory will be saved to:"
echo "  $AUTH_OUTPUT_DIR"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Run the interactive container
docker run -it --rm \
  -v "$AUTH_OUTPUT_DIR:/auth-output" \
  -v "$HOME/.gitconfig:/home/node/.gitconfig:ro" \
  --name claude-auth-setup \
  claude-setup:latest

echo ""
echo "📋 Checking authentication output..."

if [ -f "$AUTH_OUTPUT_DIR/.credentials.json" ] || [ -f "$AUTH_OUTPUT_DIR/settings.local.json" ]; then
  echo "✅ Authentication files found in $AUTH_OUTPUT_DIR"
  echo ""
  echo "📁 Captured authentication files:"
  find "$AUTH_OUTPUT_DIR" -type f -name "*.json" -o -name "*.db" | head -10
  echo ""
  echo "🔄 To use this authentication in your webhook service:"
  echo "  1. Copy files to your ~/.claude directory:"
  echo "     cp -r $AUTH_OUTPUT_DIR/* ~/.claude/"
  echo "  2. Or update docker-compose.yml to mount the auth directory:"
  echo "     - $AUTH_OUTPUT_DIR:/home/node/.claude:ro"
  echo ""
else
  echo "⚠️  No authentication files found. You may need to:"
  echo "  1. Run the container again and complete the authentication flow"
  echo "  2. Ensure you ran 'claude login' and completed the browser authentication"
  echo "  3. Check that you have an active Claude Max or Pro subscription"
fi

echo ""
echo "🧪 Testing authentication..."
echo "You can test the captured authentication with:"
echo "  docker run --rm -v \"$AUTH_OUTPUT_DIR:/home/node/.claude:ro\" claude-setup:latest claude status"