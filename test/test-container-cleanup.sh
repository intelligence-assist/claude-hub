#!/bin/bash
# Clean up a test container for E2E tests

CONTAINER_ID="$1"

if [ -z "$CONTAINER_ID" ]; then
  echo "Error: No container ID provided"
  echo "Usage: $0 <container-id>"
  exit 1
fi

echo "Stopping container $CONTAINER_ID..."
docker stop "$CONTAINER_ID" 2>/dev/null || true

echo "Removing container $CONTAINER_ID..."
docker rm "$CONTAINER_ID" 2>/dev/null || true

echo "Container cleanup complete."