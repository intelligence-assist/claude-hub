#!/bin/bash
# Wrapper script for backward compatibility
echo "This script is now located at scripts/build/build.sh"
exec scripts/build/build.sh claudecode "$@"
