#!/bin/bash

# Test GitHub token
source .env

echo "Testing GitHub token..."

# Test with curl
curl -s -H "Authorization: token ${GITHUB_TOKEN}" https://api.github.com/user | jq '.'

# Test with gh cli (in a container)
echo "Testing with gh CLI in container..."
docker run --rm -e GH_TOKEN="${GITHUB_TOKEN}" claude-code-runner:latest bash -c 'echo $GH_TOKEN | gh auth login --with-token && gh auth status'