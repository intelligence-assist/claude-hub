#!/bin/bash
# fix-runner-permissions.sh
# Permanent fix for GitHub Actions runner permission issues

set -euo pipefail

echo "🔧 Fixing GitHub Actions runner permission issues..."

# 1. Fix existing coverage directories
echo "📁 Cleaning existing coverage directories..."
find /home/gh-runner* -name "coverage" -type d 2>/dev/null | while read -r dir; do
    echo "  Fixing permissions for: $dir"
    sudo chmod -R 755 "$dir" 2>/dev/null || true
    sudo rm -rf "$dir" 2>/dev/null || true
done

# 2. Set default umask for GitHub Actions runner
echo "🔒 Setting default umask for runner processes..."
RUNNER_PROFILE="/home/gh-runner*/.bashrc"
if ! grep -q "umask 022" $RUNNER_PROFILE 2>/dev/null; then
    echo "umask 022" | sudo tee -a $RUNNER_PROFILE
fi

# 3. Create systemd drop-in for runner service
echo "⚙️  Creating systemd configuration..."
sudo mkdir -p /etc/systemd/system/actions.runner.*.service.d/
cat << 'EOF' | sudo tee /etc/systemd/system/actions.runner.*.service.d/permissions.conf
[Service]
# Set umask for all processes
UMask=0022

# Ensure proper file permissions
ExecStartPre=/bin/bash -c 'find /home/gh-runner*/actions-runner/_work -name "coverage" -type d -exec chmod -R 755 {} \; 2>/dev/null || true'
ExecStartPre=/bin/bash -c 'find /home/gh-runner*/actions-runner/_work -name "node_modules" -type d -exec chmod -R 755 {} \; 2>/dev/null || true'
EOF

# 4. Reload systemd and restart runner services
echo "🔄 Reloading systemd configuration..."
sudo systemctl daemon-reload

# 5. Create cleanup script for cron
echo "🕐 Setting up periodic cleanup..."
cat << 'EOF' | sudo tee /usr/local/bin/github-runner-cleanup.sh
#!/bin/bash
# Periodic cleanup of runner workspaces

set -euo pipefail

# Clean up old coverage directories
find /home/gh-runner*/actions-runner/_work -name "coverage" -type d -mtime +1 -exec rm -rf {} \; 2>/dev/null || true

# Fix permissions on current workspaces
find /home/gh-runner*/actions-runner/_work -type d -exec chmod 755 {} \; 2>/dev/null || true
find /home/gh-runner*/actions-runner/_work -type f -exec chmod 644 {} \; 2>/dev/null || true

# Clean up node_modules with restricted permissions
find /home/gh-runner*/actions-runner/_work -name "node_modules" -type d -exec chmod -R 755 {} \; 2>/dev/null || true

echo "$(date): GitHub runner cleanup completed"
EOF

sudo chmod +x /usr/local/bin/github-runner-cleanup.sh

# 6. Add to cron (run every 30 minutes)
if ! sudo crontab -l 2>/dev/null | grep -q "github-runner-cleanup"; then
    (sudo crontab -l 2>/dev/null; echo "*/30 * * * * /usr/local/bin/github-runner-cleanup.sh >> /var/log/github-runner-cleanup.log 2>&1") | sudo crontab -
fi

# 7. Set proper directory permissions for runner users
echo "👤 Setting runner user permissions..."
for runner_home in /home/gh-runner*; do
    if [ -d "$runner_home" ]; then
        sudo chown -R "$(basename "$runner_home")":"$(basename "$runner_home")" "$runner_home"
        sudo chmod 755 "$runner_home"
    fi
done

# 8. Create a pre-checkout script
echo "📋 Creating pre-checkout script..."
cat << 'EOF' | sudo tee /usr/local/bin/pre-checkout-cleanup.sh
#!/bin/bash
# Pre-checkout cleanup script
# Usage: /usr/local/bin/pre-checkout-cleanup.sh [workspace_path]

WORKSPACE_PATH="${1:-$GITHUB_WORKSPACE}"
WORKSPACE_PATH="${WORKSPACE_PATH:-$(pwd)}"

echo "🧹 Cleaning workspace: $WORKSPACE_PATH"

# Remove coverage directories with any permissions
find "$WORKSPACE_PATH" -name "coverage" -type d -exec chmod -R 755 {} \; 2>/dev/null || true
find "$WORKSPACE_PATH" -name "coverage" -type d -exec rm -rf {} \; 2>/dev/null || true

# Remove node_modules with restricted permissions
find "$WORKSPACE_PATH" -name "node_modules" -type d -exec chmod -R 755 {} \; 2>/dev/null || true

# Remove any .git directories that might have permission issues
find "$WORKSPACE_PATH" -name ".git" -type d -exec chmod -R 755 {} \; 2>/dev/null || true

# Set proper umask for subsequent operations
umask 022

echo "✅ Workspace cleaned successfully"
EOF

sudo chmod +x /usr/local/bin/pre-checkout-cleanup.sh

echo "✅ GitHub Actions runner permission fixes applied!"
echo "📝 Summary of changes:"
echo "   - Set default umask to 022 for all runner processes"
echo "   - Created systemd drop-in for automatic cleanup"
echo "   - Added periodic cleanup cron job (every 30 minutes)"
echo "   - Created pre-checkout cleanup script"
echo "   - Fixed existing permission issues"
echo ""
echo "🔄 Restart runner services for changes to take effect:"
echo "   sudo systemctl restart actions.runner.*.service"
echo ""
echo "🧪 Test the fix by running a workflow with coverage generation."