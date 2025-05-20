#!/bin/bash
# Script to set up the new clean repository

CLEAN_REPO="/tmp/clean-repo"

# Change to the clean repository
cd "$CLEAN_REPO" || exit 1
echo "Changed to directory: $(pwd)"

# Initialize git repository
echo "Initializing git repository..."
git init

# Configure git if needed (optional)
# git config user.name "Your Name"
# git config user.email "your.email@example.com"

# Add all files
echo "Adding files to git..."
git add .

# First checking for any remaining sensitive data
echo "Checking for potential sensitive data..."
SENSITIVE_FILES=$(grep -r "ghp_\|AKIA\|aws_secret\|github_token" --include="*.js" --include="*.sh" --include="*.json" --include="*.md" . | grep -v "EXAMPLE\|REDACTED\|dummy\|\${\|ENV\|process.env\|context.env\|mock" || echo "No sensitive data found")

if [ -n "$SENSITIVE_FILES" ]; then
  echo "⚠️ Potential sensitive data found:"
  echo "$SENSITIVE_FILES"
  echo ""
  echo "Please review the above files and remove any real credentials before continuing."
  echo "After fixing, run this script again."
  exit 1
fi

# Commit the code
echo "Creating initial commit..."
git commit -m "Initial commit - Clean repository" || exit 1

echo ""
echo "✅ Repository setup complete!"
echo ""
echo "Next steps:"
echo "1. Create a new GitHub repository at https://github.com/new"
echo "2. Connect and push this repository with:"
echo "   git remote add origin <your-new-repository-url>"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "Important: The repository is ready at $CLEAN_REPO"