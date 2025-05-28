#!/bin/bash

# Get port from environment or default to 3003
DEFAULT_PORT=${PORT:-3003}

# Kill any processes using the port
echo "Checking for existing processes on port $DEFAULT_PORT..."
pid=$(lsof -ti:$DEFAULT_PORT)
if [ ! -z "$pid" ]; then
  echo "Found process $pid using port $DEFAULT_PORT, killing it..."
  kill -9 $pid
fi

# Start the server with the specified port
echo "Starting server on port $DEFAULT_PORT..."
PORT=$DEFAULT_PORT node dist/index.js