#!/bin/bash

# Wrapper script for Claude Code to handle permission acceptance
# This script attempts to run claude with the necessary flags

# Export environment variable that might help
export CLAUDE_SKIP_PERMISSION_CHECK=1
export ANTHROPIC_CLI_NO_INTERACTIVE=1

# Try running the command directly
claude --dangerously-skip-permissions "$@"