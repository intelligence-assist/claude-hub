#!/bin/bash
# Consolidated container test script
# Usage: ./test-container.sh [basic|privileged|cleanup]

set -e

TEST_TYPE=${1:-basic}

case "$TEST_TYPE" in
  basic)
    echo "Running basic container test..."
    # Basic container test logic from test-basic-container.sh
    docker run --rm -it \
      -e REPO_FULL_NAME="owner/test-repo" \
      -e ISSUE_NUMBER="1" \
      -e IS_PULL_REQUEST="false" \
      -e COMMAND="echo 'Basic container test'" \
      -e GITHUB_TOKEN="${GITHUB_TOKEN:-test-token}" \
      claude-code-runner:latest
    ;;
  
  privileged)
    echo "Running privileged container test..."
    # Privileged container test logic from test-container-privileged.sh
    docker run --rm -it \
      --privileged \
      -e REPO_FULL_NAME="owner/test-repo" \
      -e ISSUE_NUMBER="1" \
      -e IS_PULL_REQUEST="false" \
      -e COMMAND="echo 'Privileged container test'" \
      -e GITHUB_TOKEN="${GITHUB_TOKEN:-test-token}" \
      claude-code-runner:latest
    ;;
  
  cleanup)
    echo "Running container cleanup test..."
    # Container cleanup test logic from test-container-cleanup.sh
    docker run --rm -it \
      -e REPO_FULL_NAME="owner/test-repo" \
      -e ISSUE_NUMBER="1" \
      -e IS_PULL_REQUEST="false" \
      -e COMMAND="echo 'Container cleanup test'" \
      -e GITHUB_TOKEN="${GITHUB_TOKEN:-test-token}" \
      claude-code-runner:latest
    ;;
  
  *)
    echo "Unknown test type: $TEST_TYPE"
    echo "Usage: ./test-container.sh [basic|privileged|cleanup]"
    exit 1
    ;;
esac

echo "Test complete!"
