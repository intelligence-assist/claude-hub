#!/bin/bash
# Setup cron job for Claude CLI database backups

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/../utils/backup-claude-db.sh"

# First ensure backup directories exist with proper permissions
echo "Ensuring backup directories exist..."
if [ ! -d "/backup/claude-cli" ]; then
    echo "Creating backup directories (requires sudo)..."
    sudo mkdir -p /backup/claude-cli/daily /backup/claude-cli/weekly
    sudo chown -R $USER:$USER /backup/claude-cli
fi

# Ensure backup script exists and is executable
if [ ! -f "${BACKUP_SCRIPT}" ]; then
    echo "Error: Backup script not found at ${BACKUP_SCRIPT}"
    exit 1
fi

# Make sure backup script is executable
chmod +x "${BACKUP_SCRIPT}"

# Add cron job (daily at 2 AM)
CRON_JOB="0 2 * * * ${BACKUP_SCRIPT} >> /var/log/claude-backup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "backup-claude-db.sh"; then
    echo "Claude backup cron job already exists"
else
    # Add the cron job
    (crontab -l 2>/dev/null; echo "${CRON_JOB}") | crontab -
    echo "Claude backup cron job added: ${CRON_JOB}"
fi

# Create log file with proper permissions
sudo touch /var/log/claude-backup.log
sudo chown $USER:$USER /var/log/claude-backup.log

echo "Setup complete. Backups will run daily at 2 AM."
echo "Logs will be written to /var/log/claude-backup.log"