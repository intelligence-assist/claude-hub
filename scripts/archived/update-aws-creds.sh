#!/bin/bash

# Update AWS credentials in the environment
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-dummy-access-key}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-dummy-secret-key}"

# Create or update .env file with the new credentials
if [ -f .env ]; then
  # Update existing .env file
  sed -i "s/^AWS_ACCESS_KEY_ID=.*/AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID/" .env
  sed -i "s/^AWS_SECRET_ACCESS_KEY=.*/AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY/" .env
else
  # Create new .env file from example
  cp .env.example .env
  sed -i "s/^AWS_ACCESS_KEY_ID=.*/AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID/" .env
  sed -i "s/^AWS_SECRET_ACCESS_KEY=.*/AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY/" .env
fi

echo "AWS credentials updated successfully."
echo "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID"
echo "AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:0:3}...${AWS_SECRET_ACCESS_KEY:(-3)}"

# Export the credentials for current session
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
echo "Credentials exported to current shell environment."