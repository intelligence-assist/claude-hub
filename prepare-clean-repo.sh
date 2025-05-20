#!/bin/bash
# This script prepares a clean repository without sensitive files

# Set directories
CURRENT_REPO="/home/jonflatt/n8n/claude-repo"
CLEAN_REPO="/tmp/clean-repo"

# Create clean repo directory if it doesn't exist
mkdir -p "$CLEAN_REPO"

# Files and patterns to exclude
EXCLUDES=(
  ".git"
  ".env"
  ".env.backup"
  "node_modules"
  "coverage"
  "\\"
)

# Build rsync exclude arguments
EXCLUDE_ARGS=""
for pattern in "${EXCLUDES[@]}"; do
  EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude='$pattern'"
done

# Sync files to clean repo
echo "Copying files to clean repository..."
eval "rsync -av $EXCLUDE_ARGS $CURRENT_REPO/ $CLEAN_REPO/"

# Create a new .gitignore if it doesn't exist
if [ ! -f "$CLEAN_REPO/.gitignore" ]; then
  echo "Creating .gitignore..."
  cat > "$CLEAN_REPO/.gitignore" << EOF
# Node.js
node_modules/
npm-debug.log
yarn-debug.log
yarn-error.log

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.env.backup

# Coverage reports
coverage/

# Temp directory
tmp/

# Test results
test-results/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Project specific
/response.txt
"\\"
EOF
fi

echo "Clean repository prepared at $CLEAN_REPO"
echo ""
echo "Next steps:"
echo "1. Create a new GitHub repository"
echo "2. Initialize the clean repository with git:"
echo "   cd $CLEAN_REPO"
echo "   git init"
echo "   git add ."
echo "   git commit -m \"Initial commit\""
echo "3. Set the remote origin and push:"
echo "   git remote add origin <new-repository-url>"
echo "   git push -u origin main"
echo ""
echo "Important: Make sure to review the files once more before committing to ensure no sensitive data is included."