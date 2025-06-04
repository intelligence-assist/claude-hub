#!/bin/bash
set -e

# Unified entrypoint for Claude Code operations
# Handles both auto-tagging (minimal tools) and general operations (full tools)
# Operation type is controlled by OPERATION_TYPE environment variable

# Initialize firewall - must be done as root
# Temporarily disabled to test Claude Code
# /usr/local/bin/init-firewall.sh

# Environment variables (passed from service)
# Simply reference the variables directly - no need to reassign
# They are already available in the environment

# Ensure workspace directory exists and has proper permissions
mkdir -p /workspace
chown -R node:node /workspace

# Set up Claude authentication by syncing from captured auth directory
if [ -d "/home/node/.claude" ]; then
  echo "Setting up Claude authentication from mounted auth directory..." >&2
  
  # Create a writable copy of Claude configuration in workspace
  CLAUDE_WORK_DIR="/workspace/.claude"
  mkdir -p "$CLAUDE_WORK_DIR"
  
  echo "DEBUG: Source auth directory contents:" >&2
  ls -la /home/node/.claude/ >&2 || echo "DEBUG: Source auth directory not accessible" >&2
  
  # Sync entire auth directory to writable location (including database files, project state, etc.)
  if command -v rsync >/dev/null 2>&1; then
    rsync -av /home/node/.claude/ "$CLAUDE_WORK_DIR/" 2>/dev/null || echo "rsync failed, trying cp" >&2
  else
    # Fallback to cp with comprehensive copying
    cp -r /home/node/.claude/* "$CLAUDE_WORK_DIR/" 2>/dev/null || true
    cp -r /home/node/.claude/.* "$CLAUDE_WORK_DIR/" 2>/dev/null || true
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
else
  echo "WARNING: No Claude authentication source found at /home/node/.claude." >&2
fi

# Configure GitHub authentication
if [ -n "${GITHUB_TOKEN}" ]; then
  export GH_TOKEN="${GITHUB_TOKEN}"
  echo "${GITHUB_TOKEN}" | sudo -u node gh auth login --with-token
  sudo -u node gh auth setup-git
else
  echo "No GitHub token provided, skipping GitHub authentication"
fi

# Clone the repository as node user
if [ -n "${GITHUB_TOKEN}" ] && [ -n "${REPO_FULL_NAME}" ]; then
  echo "Cloning repository ${REPO_FULL_NAME}..." >&2
  sudo -u node git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_FULL_NAME}.git" /workspace/repo >&2
  cd /workspace/repo
else
  echo "Skipping repository clone - missing GitHub token or repository name" >&2
  cd /workspace
fi

# Checkout the correct branch based on operation type
if [ "${OPERATION_TYPE}" = "auto-tagging" ]; then
    # Auto-tagging always uses main branch (doesn't need specific branches)
    echo "Using main branch for auto-tagging" >&2
    sudo -u node git checkout main >&2 || sudo -u node git checkout master >&2
elif [ "${IS_PULL_REQUEST}" = "true" ] && [ -n "${BRANCH_NAME}" ]; then
    echo "Checking out PR branch: ${BRANCH_NAME}" >&2
    sudo -u node git checkout "${BRANCH_NAME}" >&2
else
    echo "Using main branch" >&2
    sudo -u node git checkout main >&2 || sudo -u node git checkout master >&2
fi

# Configure git for commits using environment variables (with defaults)
sudo -u node git config --global user.email "${BOT_EMAIL:-claude@example.com}"
sudo -u node git config --global user.name "${BOT_USERNAME:-ClaudeBot}"

# Configure Claude authentication
# Support both API key and interactive auth methods
echo "DEBUG: Checking authentication options..." >&2
echo "DEBUG: ANTHROPIC_API_KEY set: $([ -n "${ANTHROPIC_API_KEY}" ] && echo 'YES' || echo 'NO')" >&2
echo "DEBUG: /workspace/.claude/.credentials.json exists: $([ -f "/workspace/.claude/.credentials.json" ] && echo 'YES' || echo 'NO')" >&2
echo "DEBUG: /workspace/.claude contents:" >&2
ls -la /workspace/.claude/ >&2 || echo "DEBUG: /workspace/.claude directory not found" >&2

if [ -n "${ANTHROPIC_API_KEY}" ]; then
  echo "Using Anthropic API key for authentication..." >&2
  export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
elif [ -f "/workspace/.claude/.credentials.json" ]; then
  echo "Using Claude interactive authentication from working directory..." >&2
  # No need to set ANTHROPIC_API_KEY - Claude CLI will use the credentials file
  # Set HOME to point to our working directory for Claude CLI
  export CLAUDE_HOME="/workspace/.claude"
  echo "DEBUG: Set CLAUDE_HOME to $CLAUDE_HOME" >&2
else
  echo "WARNING: No Claude authentication found. Please set ANTHROPIC_API_KEY or ensure ~/.claude is mounted." >&2
fi

# Create response file with proper permissions
RESPONSE_FILE="/workspace/response.txt"
touch "${RESPONSE_FILE}"
chown node:node "${RESPONSE_FILE}"

# Determine allowed tools based on operation type
if [ "${OPERATION_TYPE}" = "auto-tagging" ]; then
    ALLOWED_TOOLS="Read,GitHub,Bash(gh issue edit:*),Bash(gh issue view:*),Bash(gh label list:*)"  # Minimal tools for auto-tagging (security)
    echo "Running Claude Code for auto-tagging with minimal tools..." >&2
elif [ "${OPERATION_TYPE}" = "pr-review" ] || [ "${OPERATION_TYPE}" = "manual-pr-review" ]; then
    # PR Review: Broad research access + controlled write access
    # Read access: Full file system, git history, GitHub data
    # Write access: GitHub comments/reviews, PR labels, but no file deletion/modification
    ALLOWED_TOOLS="Read,GitHub,Bash(gh:*),Bash(git log:*),Bash(git show:*),Bash(git diff:*),Bash(git blame:*),Bash(find:*),Bash(grep:*),Bash(rg:*),Bash(cat:*),Bash(head:*),Bash(tail:*),Bash(ls:*),Bash(tree:*)"
    echo "Running Claude Code for PR review with broad research access..." >&2
else
    ALLOWED_TOOLS="Bash,Create,Edit,Read,Write,GitHub"  # Full tools for general operations
    echo "Running Claude Code with full tool access..." >&2
fi

# Check if command exists
if [ -z "${COMMAND}" ]; then
  echo "ERROR: No command provided. COMMAND environment variable is empty." | tee -a "${RESPONSE_FILE}" >&2
  exit 1
fi

# Log the command length for debugging
echo "Command length: ${#COMMAND}" >&2

# Run Claude Code with proper HOME environment
# If we synced Claude auth to workspace, use workspace as HOME
if [ -f "/workspace/.claude/.credentials.json" ]; then
  CLAUDE_USER_HOME="/workspace"
  echo "DEBUG: Using /workspace as HOME for Claude CLI (synced auth)" >&2
else
  CLAUDE_USER_HOME="${CLAUDE_HOME:-/home/node}"
  echo "DEBUG: Using $CLAUDE_USER_HOME as HOME for Claude CLI (fallback)" >&2
fi

if [ "${OUTPUT_FORMAT}" = "stream-json" ]; then
  # For stream-json, output directly to stdout for real-time processing
  exec sudo -u node -E env \
      HOME="$CLAUDE_USER_HOME" \
      PATH="/usr/local/bin:/usr/local/share/npm-global/bin:$PATH" \
      ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
      GH_TOKEN="${GITHUB_TOKEN}" \
      GITHUB_TOKEN="${GITHUB_TOKEN}" \
      BASH_DEFAULT_TIMEOUT_MS="${BASH_DEFAULT_TIMEOUT_MS}" \
      BASH_MAX_TIMEOUT_MS="${BASH_MAX_TIMEOUT_MS}" \
      /usr/local/share/npm-global/bin/claude \
      --allowedTools "${ALLOWED_TOOLS}" \
      --output-format stream-json \
      --verbose \
      --print "${COMMAND}"
else
  # Default behavior - write to file
  sudo -u node -E env \
      HOME="$CLAUDE_USER_HOME" \
      PATH="/usr/local/bin:/usr/local/share/npm-global/bin:$PATH" \
      ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
      GH_TOKEN="${GITHUB_TOKEN}" \
      GITHUB_TOKEN="${GITHUB_TOKEN}" \
      BASH_DEFAULT_TIMEOUT_MS="${BASH_DEFAULT_TIMEOUT_MS}" \
      BASH_MAX_TIMEOUT_MS="${BASH_MAX_TIMEOUT_MS}" \
      /usr/local/share/npm-global/bin/claude \
      --allowedTools "${ALLOWED_TOOLS}" \
      --verbose \
      --print "${COMMAND}" \
      > "${RESPONSE_FILE}" 2>&1
fi

# Check for errors
if [ $? -ne 0 ]; then
  echo "ERROR: Claude Code execution failed. See logs for details." | tee -a "${RESPONSE_FILE}" >&2
fi

# Output the response
cat "${RESPONSE_FILE}"