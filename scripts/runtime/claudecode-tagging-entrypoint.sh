#!/bin/bash
set -e

# Minimal entrypoint for auto-tagging workflow
# Only allows Read and GitHub tools for security

# Environment variables (passed from service)
# Simply reference the variables directly - no need to reassign
# They are already available in the environment

# Ensure workspace directory exists and has proper permissions
mkdir -p /workspace
chown -R node:node /workspace

# Set up Claude authentication by syncing from captured auth directory
if [ -d "/claude-auth-source" ]; then
  echo "Setting up Claude authentication from captured auth directory..." >&2
  
  # Create a writable copy of Claude configuration in workspace
  CLAUDE_WORK_DIR="/workspace/.claude"
  mkdir -p "$CLAUDE_WORK_DIR"
  
  echo "DEBUG: Source auth directory contents:" >&2
  ls -la /claude-auth-source/ >&2 || echo "DEBUG: Source auth directory not accessible" >&2
  
  # Sync entire auth directory to writable location (including database files, project state, etc.)
  if command -v rsync >/dev/null 2>&1; then
    rsync -av /claude-auth-source/ "$CLAUDE_WORK_DIR/" 2>/dev/null || echo "rsync failed, trying cp" >&2
  else
    # Fallback to cp with comprehensive copying
    cp -r /claude-auth-source/* "$CLAUDE_WORK_DIR/" 2>/dev/null || true
    cp -r /claude-auth-source/.* "$CLAUDE_WORK_DIR/" 2>/dev/null || true
  fi
  
  echo "DEBUG: Working directory contents after sync:" >&2
  ls -la "$CLAUDE_WORK_DIR/" >&2 || echo "DEBUG: Working directory not accessible" >&2
  
  # Set proper ownership and permissions for the node user
  chown -R node:node "$CLAUDE_WORK_DIR"
  chmod 600 "$CLAUDE_WORK_DIR"/.credentials.json 2>/dev/null || true
  chmod 755 "$CLAUDE_WORK_DIR" 2>/dev/null || true
  
  echo "DEBUG: Final permissions check:" >&2
  ls -la "$CLAUDE_WORK_DIR/.credentials.json" >&2 || echo "DEBUG: .credentials.json not found" >&2
  
  echo "Claude authentication directory synced to $CLAUDE_WORK_DIR" >&2
elif [ -d "/home/node/.claude" ]; then
  echo "WARNING: Found /home/node/.claude but no /claude-auth-source. This might use your personal auth." >&2
else
  echo "WARNING: No Claude authentication source found." >&2
fi

# Configure GitHub authentication
if [ -n "${GITHUB_TOKEN}" ]; then
  export GH_TOKEN="${GITHUB_TOKEN}"
  echo "${GITHUB_TOKEN}" | sudo -u node gh auth login --with-token
  sudo -u node gh auth setup-git
else
  echo "No GitHub token provided, skipping GitHub authentication"
fi

# Clone the repository as node user (needed for context)
if [ -n "${GITHUB_TOKEN}" ] && [ -n "${REPO_FULL_NAME}" ]; then
  echo "Cloning repository ${REPO_FULL_NAME}..." >&2
  sudo -u node git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_FULL_NAME}.git" /workspace/repo >&2
  cd /workspace/repo
else
  echo "Skipping repository clone - missing GitHub token or repository name" >&2
  cd /workspace
fi

# Checkout main branch (tagging doesn't need specific branches)
echo "Using main branch" >&2
sudo -u node git checkout main >&2 || sudo -u node git checkout master >&2

# Configure git for minimal operations
sudo -u node git config --global user.email "${BOT_EMAIL:-claude@example.com}"
sudo -u node git config --global user.name "${BOT_USERNAME:-ClaudeBot}"

# Configure Claude authentication
# Support both API key and interactive auth methods
if [ -n "${ANTHROPIC_API_KEY}" ]; then
  echo "Using Anthropic API key for authentication..." >&2
  export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
elif [ -f "/workspace/.claude/.credentials.json" ]; then
  echo "Using Claude interactive authentication from working directory..." >&2
  # No need to set ANTHROPIC_API_KEY - Claude CLI will use the credentials file
  # Set HOME to point to our working directory for Claude CLI
  export CLAUDE_HOME="/workspace/.claude"
else
  echo "WARNING: No Claude authentication found. Please set ANTHROPIC_API_KEY or ensure ~/.claude is mounted." >&2
fi

# Create response file with proper permissions
RESPONSE_FILE="/workspace/response.txt"
touch "${RESPONSE_FILE}"
chown node:node "${RESPONSE_FILE}"

# Run Claude Code with minimal tools for auto-tagging
echo "Running Claude Code for auto-tagging..." >&2

# Check if command exists
if [ -z "${COMMAND}" ]; then
  echo "ERROR: No command provided. COMMAND environment variable is empty." | tee -a "${RESPONSE_FILE}" >&2
  exit 1
fi

# Log the command length for debugging
echo "Command length: ${#COMMAND}" >&2

# Run Claude Code with minimal tool set: Read (for repository context) and GitHub (for label operations)
# Use working directory as HOME if we have Claude auth there, otherwise use default
CLAUDE_USER_HOME="${CLAUDE_HOME:-/home/node}"

sudo -u node -E env \
    HOME="$CLAUDE_USER_HOME" \
    PATH="/usr/local/bin:/usr/local/share/npm-global/bin:$PATH" \
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
    GH_TOKEN="${GITHUB_TOKEN}" \
    /usr/local/share/npm-global/bin/claude \
    --allowedTools Read,GitHub \
    --print "${COMMAND}" \
    > "${RESPONSE_FILE}" 2>&1

# Check for errors
if [ $? -ne 0 ]; then
  echo "ERROR: Claude Code execution failed. See logs for details." | tee -a "${RESPONSE_FILE}" >&2
fi

# Output the response
cat "${RESPONSE_FILE}"