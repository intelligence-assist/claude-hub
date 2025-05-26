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

# Configure Anthropic API key
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"

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
sudo -u node -E env \
    HOME="/home/node" \
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