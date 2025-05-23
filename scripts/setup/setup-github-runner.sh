#!/bin/bash

# Setup GitHub Actions self-hosted runner for claude-github-webhook

set -e

# Configuration
RUNNER_DIR="/home/jonflatt/github-actions-runner"
RUNNER_VERSION="2.324.0"
REPO_URL="https://github.com/intelligence-assist/claude-github-webhook"
RUNNER_NAME="claude-webhook-runner"
RUNNER_LABELS="self-hosted,linux,x64,claude-webhook"

echo "🚀 Setting up GitHub Actions self-hosted runner..."

# Create runner directory
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# Download runner if not exists
if [ ! -f "actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" ]; then
    echo "📦 Downloading runner v${RUNNER_VERSION}..."
    curl -o "actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" -L \
        "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
fi

# Extract runner
echo "📂 Extracting runner..."
tar xzf "./actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"

# Install dependencies if needed
echo "🔧 Installing dependencies..."
sudo ./bin/installdependencies.sh || true

echo ""
echo "⚠️  IMPORTANT: You need to get a runner registration token from GitHub!"
echo ""
echo "1. Go to: https://github.com/intelligence-assist/claude-github-webhook/settings/actions/runners/new"
echo "2. Copy the registration token"
echo "3. Run the configuration command below with your token:"
echo ""
echo "cd $RUNNER_DIR"
echo "./config.sh --url $REPO_URL --token YOUR_TOKEN_HERE --name $RUNNER_NAME --labels $RUNNER_LABELS --unattended --replace"
echo ""
echo "4. After configuration, install as a service:"
echo "sudo ./svc.sh install"
echo "sudo ./svc.sh start"
echo ""
echo "5. Check status:"
echo "sudo ./svc.sh status"
echo ""

# Create systemd service file for the runner
cat > "$RUNNER_DIR/actions.runner.service" << 'EOF'
[Unit]
Description=GitHub Actions Runner (claude-webhook-runner)
After=network-online.target

[Service]
Type=simple
User=jonflatt
WorkingDirectory=/home/jonflatt/github-actions-runner
ExecStart=/home/jonflatt/github-actions-runner/run.sh
Restart=on-failure
RestartSec=5
KillMode=process
KillSignal=SIGTERM
StandardOutput=journal
StandardError=journal
SyslogIdentifier=github-runner

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/jonflatt/github-actions-runner
ReadWritePaths=/home/jonflatt/n8n/claude-repo
ReadWritePaths=/var/run/docker.sock

[Install]
WantedBy=multi-user.target
EOF

echo "📄 Systemd service file created at: $RUNNER_DIR/actions.runner.service"
echo ""
echo "Alternative: Use systemd directly instead of ./svc.sh:"
echo "sudo cp $RUNNER_DIR/actions.runner.service /etc/systemd/system/github-runner-claude.service"
echo "sudo systemctl daemon-reload"
echo "sudo systemctl enable github-runner-claude"
echo "sudo systemctl start github-runner-claude"