#!/bin/bash
set -e

# Create required directories
mkdir -p logs

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env file. Please update it with your actual values."
else
  echo ".env file already exists."
fi

# Install dependencies
npm install

# Set up pre-commit hooks (for development)
npm run setup:dev

echo "Setup complete! Update your .env file with your GitHub token, webhook secret, and Claude API key."
echo "Pre-commit hooks for credential scanning have been installed."
echo "Then start the server with: npm start"
echo "Or for development: npm run dev"