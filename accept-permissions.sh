#!/bin/bash

# Script to accept Claude Code permissions non-interactively
# This needs to be run once to set up the permissions

# Create a pseudo-terminal to simulate an interactive session
expect -c '
    spawn claude --dangerously-skip-permissions --print "test"
    expect {
        "accept" { send "yes\r" }
        "Are you sure" { send "y\r" } 
        "Continue" { send "y\r" }
        timeout { send "\r" }
    }
    expect eof
'

# Alternative approach - use yes to auto-accept
echo "yes" | claude --dangerously-skip-permissions --print "test" || true