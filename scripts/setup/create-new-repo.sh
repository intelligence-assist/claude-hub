#!/bin/bash
# Script to prepare, clean, and set up a new repository

CURRENT_REPO="/home/jonflatt/n8n/claude-repo"
CLEAN_REPO="/tmp/clean-repo"

echo "=== STEP 1: Preparing clean repository ==="
# Run the prepare script
bash "$CURRENT_REPO/prepare-clean-repo.sh"

echo ""
echo "=== STEP 2: Fixing credential references ==="
# Fix credential references
bash "$CURRENT_REPO/fix-credential-references.sh"

echo ""
echo "=== STEP 3: Setting up git repository ==="
# Change to the clean repository
cd "$CLEAN_REPO" || exit 1

# Initialize git repository
git init

# Add all files
git add .

# Check if there are any files to commit
if ! git diff --cached --quiet; then
  # Create initial commit
  git commit -m "Initial commit - Clean repository"
  
  echo ""
  echo "=== Repository ready! ==="
  echo "The clean repository has been created at: $CLEAN_REPO"
  echo ""
  echo "Next steps:"
  echo "1. Create a new GitHub repository at https://github.com/new"
  echo "2. Connect this repository to GitHub:"
  echo "   cd $CLEAN_REPO"
  echo "   git remote add origin <your-new-repository-url>"
  echo "   git branch -M main"  
  echo "   git push -u origin main"
else
  echo "No files to commit. Something went wrong with the file preparation."
  exit 1
fi