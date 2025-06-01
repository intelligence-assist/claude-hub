#!/bin/bash
# Clean runner configuration - no hacks, just proper setup

set -euo pipefail

echo "🔧 Configuring GitHub Actions runner for clean builds..."

# 1. Set proper umask in runner service
sudo tee /etc/systemd/system/actions.runner.*.service.d/override.conf << 'EOF'
[Service]
UMask=0022
Environment=UMASK=022
EOF

# 2. Configure runner user shell
sudo tee -a ~gh-runner/.bashrc << 'EOF'
# Set proper umask for all processes
umask 022

# Clean workspace function
clean_workspace() {
    if [ -n "${GITHUB_WORKSPACE:-}" ]; then
        sudo rm -rf "${GITHUB_WORKSPACE}" 2>/dev/null || true
        mkdir -p "${GITHUB_WORKSPACE}"
    fi
}
EOF

# 3. Add pre-action script to runner
sudo tee /opt/actions-runner/pre-action.sh << 'EOF'
#!/bin/bash
# Clean workspace before each action
umask 022
sudo rm -rf "${GITHUB_WORKSPACE}" 2>/dev/null || true
mkdir -p "${GITHUB_WORKSPACE}"
EOF

sudo chmod +x /opt/actions-runner/pre-action.sh

# 4. Restart runner services
sudo systemctl daemon-reload
sudo systemctl restart actions.runner.*.service

echo "✅ Runner configured for clean builds"