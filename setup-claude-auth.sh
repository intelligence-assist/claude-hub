#!/bin/bash
# Wrapper script for backward compatibility
echo "This script is now located at scripts/setup/setup-claude-auth.sh"
exec scripts/setup/setup-claude-auth.sh "$@"
