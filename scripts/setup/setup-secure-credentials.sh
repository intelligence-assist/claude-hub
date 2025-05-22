#!/bin/bash

# Setup Secure Credentials Script
# Creates secure credential files with proper permissions

set -e

echo "🔐 Setting up secure credentials..."

# Create secrets directory
SECRETS_DIR="./secrets"
mkdir -p "$SECRETS_DIR"

# Set restrictive permissions on secrets directory
chmod 700 "$SECRETS_DIR"

echo "📁 Created secrets directory: $SECRETS_DIR"

# Function to create secure credential file
create_credential_file() {
    local filename="$1"
    local description="$2"
    local filepath="$SECRETS_DIR/$filename"
    
    if [ -f "$filepath" ]; then
        echo "⚠️  $filepath already exists, skipping..."
        return
    fi
    
    echo "🔑 Creating $description credential file..."
    read -s -p "Enter $description: " credential
    echo
    
    # Write credential to file
    echo "$credential" > "$filepath"
    
    # Set secure permissions (owner read-only)
    chmod 600 "$filepath"
    
    echo "✅ Created $filepath with secure permissions"
}

# Create credential files
create_credential_file "github_token.txt" "GitHub Personal Access Token"
create_credential_file "anthropic_api_key.txt" "Anthropic API Key"
create_credential_file "webhook_secret.txt" "GitHub Webhook Secret"

# Create .env file without secrets
cat > .env.secure << 'EOF'
# Secure Configuration (no secrets in env vars)
NODE_ENV=production
PORT=3002

# Bot Configuration
BOT_USERNAME=@MCPClaude
DEFAULT_GITHUB_OWNER=Cheffromspace
DEFAULT_GITHUB_USER=Cheffromspace
DEFAULT_BRANCH=main

# Security Configuration
AUTHORIZED_USERS=Cheffromspace

# Container Configuration
CLAUDE_USE_CONTAINERS=1
CLAUDE_CONTAINER_IMAGE=claudecode:latest

# Credential file paths (Docker secrets)
GITHUB_TOKEN_FILE=/run/secrets/github_token
ANTHROPIC_API_KEY_FILE=/run/secrets/anthropic_api_key
GITHUB_WEBHOOK_SECRET_FILE=/run/secrets/webhook_secret
EOF

echo "✅ Created .env.secure configuration file"

# Update .gitignore to exclude secrets
if ! grep -q "secrets/" .gitignore 2>/dev/null; then
    echo "secrets/" >> .gitignore
    echo "✅ Added secrets/ to .gitignore"
fi

echo ""
echo "🎉 Secure credentials setup complete!"
echo ""
echo "Next steps:"
echo "1. Start with Docker secrets: docker compose -f docker-compose.secrets.yml up -d"
echo "2. Or use local files: cp .env.secure .env && npm start"
echo "3. Verify credentials are loaded: check application logs"
echo ""
echo "🔒 Security notes:"
echo "- Credential files have 600 permissions (owner read-only)"
echo "- secrets/ directory is added to .gitignore"
echo "- Use Docker secrets in production for maximum security"