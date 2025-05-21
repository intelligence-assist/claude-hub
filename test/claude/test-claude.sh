#!/bin/bash
# Consolidated Claude test script
# Usage: ./test-claude.sh [direct|installation|no-firewall|response]

set -e

TEST_TYPE=${1:-direct}

case "$TEST_TYPE" in
  direct)
    echo "Testing direct Claude integration..."
    # Direct Claude test logic from test-claude-direct.sh
    docker run --rm -it \
      -e REPO_FULL_NAME="owner/test-repo" \
      -e ISSUE_NUMBER="1" \
      -e IS_PULL_REQUEST="false" \
      -e COMMAND="echo 'Direct Claude test'" \
      -e GITHUB_TOKEN="${GITHUB_TOKEN:-test-token}" \
      -e ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-test-key}" \
      claude-code-runner:latest
    ;;
  
  installation)
    echo "Testing Claude installation..."
    # Installation test logic from test-claude-installation.sh and test-claude-version.sh
    docker run --rm -it \
      -e REPO_FULL_NAME="owner/test-repo" \
      -e ISSUE_NUMBER="1" \
      -e IS_PULL_REQUEST="false" \
      -e COMMAND="claude-cli --version && claude --version" \
      -e GITHUB_TOKEN="${GITHUB_TOKEN:-test-token}" \
      claude-code-runner:latest
    ;;
  
  no-firewall)
    echo "Testing Claude without firewall..."
    # Test logic from test-claude-no-firewall.sh
    docker run --rm -it \
      -e REPO_FULL_NAME="owner/test-repo" \
      -e ISSUE_NUMBER="1" \
      -e IS_PULL_REQUEST="false" \
      -e COMMAND="echo 'Claude without firewall test'" \
      -e GITHUB_TOKEN="${GITHUB_TOKEN:-test-token}" \
      -e DISABLE_FIREWALL=true \
      claude-code-runner:latest
    ;;
  
  response)
    echo "Testing Claude response..."
    # Test logic from test-claude-response.sh
    docker run --rm -it \
      -e REPO_FULL_NAME="owner/test-repo" \
      -e ISSUE_NUMBER="1" \
      -e IS_PULL_REQUEST="false" \
      -e COMMAND="claude \"Tell me a joke\"" \
      -e GITHUB_TOKEN="${GITHUB_TOKEN:-test-token}" \
      -e ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-test-key}" \
      claude-code-runner:latest
    ;;
  
  *)
    echo "Unknown test type: $TEST_TYPE"
    echo "Usage: ./test-claude.sh [direct|installation|no-firewall|response]"
    exit 1
    ;;
esac

echo "Test complete!"
