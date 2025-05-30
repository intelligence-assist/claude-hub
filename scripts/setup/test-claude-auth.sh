#!/bin/bash
set -e

# Test captured Claude authentication
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AUTH_OUTPUT_DIR="$PROJECT_ROOT/claude-auth-output"

echo "🧪 Testing Claude Authentication"
echo "================================"
echo ""

if [ ! -d "$AUTH_OUTPUT_DIR" ]; then
  echo "❌ Authentication directory not found: $AUTH_OUTPUT_DIR"
  echo "   Run ./scripts/setup/setup-claude-interactive.sh first"
  exit 1
fi

echo "📁 Authentication files found:"
find "$AUTH_OUTPUT_DIR" -type f | head -20
echo ""

echo "🔍 Testing authentication with Claude CLI..."
echo ""

# Test Claude version
echo "1. Testing Claude CLI version..."
docker run --rm \
  -v "$AUTH_OUTPUT_DIR:/home/node/.claude:ro" \
  claude-setup:latest \
  sudo -u node -E env HOME=/home/node PATH=/usr/local/share/npm-global/bin:$PATH \
  /usr/local/share/npm-global/bin/claude --version

echo ""

# Test Claude status (might fail due to TTY requirements)
echo "2. Testing Claude status..."
docker run --rm \
  -v "$AUTH_OUTPUT_DIR:/home/node/.claude:ro" \
  claude-setup:latest \
  timeout 5 sudo -u node -E env HOME=/home/node PATH=/usr/local/share/npm-global/bin:$PATH \
  /usr/local/share/npm-global/bin/claude status 2>&1 || echo "Status command failed (expected due to TTY requirements)"

echo ""

# Test Claude with a simple print command
echo "3. Testing Claude with simple command..."
docker run --rm \
  -v "$AUTH_OUTPUT_DIR:/home/node/.claude:ro" \
  claude-setup:latest \
  timeout 10 sudo -u node -E env HOME=/home/node PATH=/usr/local/share/npm-global/bin:$PATH \
  /usr/local/share/npm-global/bin/claude --print "Hello, testing authentication" 2>&1 || echo "Print command failed"

echo ""
echo "🔍 Authentication file analysis:"
echo "================================"

# Check for key authentication files
if [ -f "$AUTH_OUTPUT_DIR/.credentials.json" ]; then
  echo "✅ .credentials.json found ($(wc -c < "$AUTH_OUTPUT_DIR/.credentials.json") bytes)"
else
  echo "❌ .credentials.json not found"
fi

if [ -f "$AUTH_OUTPUT_DIR/settings.local.json" ]; then
  echo "✅ settings.local.json found"
  echo "   Contents: $(head -1 "$AUTH_OUTPUT_DIR/settings.local.json")"
else
  echo "❌ settings.local.json not found"
fi

if [ -d "$AUTH_OUTPUT_DIR/statsig" ]; then
  echo "✅ statsig directory found ($(ls -1 "$AUTH_OUTPUT_DIR/statsig" | wc -l) files)"
else
  echo "❌ statsig directory not found"
fi

# Look for SQLite databases
DB_FILES=$(find "$AUTH_OUTPUT_DIR" -name "*.db" 2>/dev/null | wc -l)
if [ "$DB_FILES" -gt 0 ]; then
  echo "✅ Found $DB_FILES SQLite database files"
  find "$AUTH_OUTPUT_DIR" -name "*.db" | head -5
else
  echo "❌ No SQLite database files found"
fi

echo ""
echo "💡 Next steps:"
echo "  If authentication tests pass, copy to your main Claude directory:"
echo "    cp -r $AUTH_OUTPUT_DIR/* ~/.claude/"
echo "  Or update your webhook service to use this authentication directory"