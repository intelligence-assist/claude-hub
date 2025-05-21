#!/bin/bash
# Wrapper script for backward compatibility
echo "This script is now located at scripts/runtime/start-api.sh"
exec scripts/runtime/start-api.sh "$@"
