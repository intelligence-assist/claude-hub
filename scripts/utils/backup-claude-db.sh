#!/bin/bash
# Backup Claude CLI database to prevent corruption

# Use SUDO_USER if running with sudo, otherwise use current user
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)

CLAUDE_DIR="${ACTUAL_HOME}/.claude"
DB_FILE="${CLAUDE_DIR}/__store.db"
BACKUP_ROOT="/backup/claude-cli"
BACKUP_DIR="${BACKUP_ROOT}/daily"
WEEKLY_DIR="${BACKUP_ROOT}/weekly"

# Create backup directories if they don't exist (may need sudo)
if [ ! -d "${BACKUP_ROOT}" ]; then
    if [ -w "/backup" ]; then
        mkdir -p "${BACKUP_DIR}" "${WEEKLY_DIR}"
    else
        echo "Error: Cannot create backup directories in /backup"
        echo "Please run: sudo mkdir -p ${BACKUP_DIR} ${WEEKLY_DIR}"
        echo "Then run: sudo chown -R $USER:$USER ${BACKUP_ROOT}"
        exit 1
    fi
else
    mkdir -p "${BACKUP_DIR}" "${WEEKLY_DIR}"
fi

# Generate timestamp for backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 6=Saturday
DATE_ONLY=$(date +%Y%m%d)

# Create backup if database exists
if [ -f "${DB_FILE}" ]; then
    echo "Backing up Claude database..."
    
    # Daily backup
    DAILY_BACKUP="${BACKUP_DIR}/store_${TIMESTAMP}.db"
    cp "${DB_FILE}" "${DAILY_BACKUP}"
    echo "Daily backup created: ${DAILY_BACKUP}"
    
    # Weekly backup on Saturdays
    if [ "${DAY_OF_WEEK}" -eq "6" ]; then
        WEEKLY_BACKUP="${WEEKLY_DIR}/store_saturday_${DATE_ONLY}.db"
        cp "${DB_FILE}" "${WEEKLY_BACKUP}"
        echo "Weekly Saturday backup created: ${WEEKLY_BACKUP}"
    fi
    
    # Clean up old daily backups (keep last 7 days)
    find "${BACKUP_DIR}" -name "store_*.db" -type f -mtime +7 -delete
    
    # Clean up old weekly backups (keep last 52 weeks)
    find "${WEEKLY_DIR}" -name "store_saturday_*.db" -type f -mtime +364 -delete
    
else
    echo "No Claude database found at ${DB_FILE}"
fi