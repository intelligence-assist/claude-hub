#!/bin/bash

echo "Starting Claude GitHub webhook service..."

# Build the Claude Code runner image
echo "Building Claude Code runner image..."
if docker build -f Dockerfile.claudecode -t claude-code-runner:latest .; then
    echo "Claude Code runner image built successfully."
else
    echo "Warning: Failed to build Claude Code runner image. Service will attempt to build on first use."
fi

# Ensure dependencies are installed (in case volume mount affected node_modules)
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/tsc" ]; then
    echo "Installing dependencies..."
    npm ci
fi

# Always compile TypeScript to ensure we have the latest compiled source
echo "Compiling TypeScript..."
npm run build

# Start the webhook service
echo "Starting webhook service..."
exec node dist/index.js