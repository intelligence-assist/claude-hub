#!/bin/sh

# Ensure logs directory exists and has proper permissions
mkdir -p /app/logs
chmod 777 /app/logs

# Switch to claudeuser and execute the main command
exec gosu claudeuser "$@"