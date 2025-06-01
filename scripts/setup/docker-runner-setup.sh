#!/bin/bash
# Setup clean Docker-based GitHub Actions runners

set -euo pipefail

echo "🐳 Setting up Docker-based GitHub Actions runners..."

# Create docker-compose for runners
cat > docker-compose.runners.yml << 'EOF'
version: '3.8'

services:
  github-runner-1:
    image: myoung34/github-runner:latest
    environment:
      REPO_URL: https://github.com/intelligence-assist/claude-hub
      RUNNER_TOKEN: ${RUNNER_TOKEN}
      RUNNER_NAME: docker-runner-1
      RUNNER_WORKDIR: /tmp/runner/work
      RUNNER_GROUP: default
      LABELS: linux,x64,docker
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - runner1-work:/tmp/runner/work
    restart: unless-stopped
    
  github-runner-2:
    image: myoung34/github-runner:latest
    environment:
      REPO_URL: https://github.com/intelligence-assist/claude-hub
      RUNNER_TOKEN: ${RUNNER_TOKEN}
      RUNNER_NAME: docker-runner-2
      RUNNER_WORKDIR: /tmp/runner/work
      RUNNER_GROUP: default
      LABELS: linux,x64,docker
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - runner2-work:/tmp/runner/work
    restart: unless-stopped

volumes:
  runner1-work:
  runner2-work:
EOF

echo "✅ Docker runner configuration created"
echo "📝 To deploy:"
echo "   1. Get runner token from GitHub repo settings"
echo "   2. export RUNNER_TOKEN=your_token"
echo "   3. docker-compose -f docker-compose.runners.yml up -d"