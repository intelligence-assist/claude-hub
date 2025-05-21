#!/bin/bash
echo "Setting up Claude Code authentication..."

# Build the setup container
docker build -f Dockerfile.setup -t claude-setup .

# Run it interactively with AWS credentials mounted
docker run -it -v $HOME/.aws:/root/.aws:ro claude-setup

echo ""
echo "After completing the authentication in the container:"
echo "1. Run 'docker ps -a' to find the container ID"
echo "2. Run 'docker cp <container_id>:/root/.claude ./claude-config'"
echo "3. Then run './update-production-image.sh'"