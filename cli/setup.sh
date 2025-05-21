#!/bin/bash

# Claude Webhook CLI Setup Script

echo "Claude Webhook CLI Setup"
echo "========================"
echo

# Check if .env exists
if [ -f "../.env" ]; then
    echo "✅ Found existing .env file"
else
    echo "📝 Creating .env file..."
    cat > ../.env << EOF
# Claude Webhook API Configuration
API_URL=https://claude.jonathanflatt.org
GITHUB_WEBHOOK_SECRET=your-webhook-secret-here
GITHUB_TOKEN=your-github-token-here
EOF
    echo "✅ Created .env file - please update with your credentials"
fi

# Install dependencies
echo
echo "📦 Installing dependencies..."
cd .. && npm install

echo
echo "✅ Setup complete!"
echo
echo "Next steps:"
echo "1. Update the .env file with your credentials"
echo "2. Run the CLI with: ./claude-webhook myrepo \"Your command\""
echo
echo "Examples:"
echo "  ./claude-webhook myrepo \"List all files\""
echo "  ./claude-webhook owner/myrepo \"Analyze code structure\""
echo "  ./claude-webhook myrepo \"Review PR\" -p -b feature-branch"