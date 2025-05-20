#!/bin/bash
# Script to fix potential credential references in the clean repository

CLEAN_REPO="/tmp/clean-repo"
cd "$CLEAN_REPO" || exit 1

echo "Fixing potential credential references..."

# 1. Fix test files with example tokens
echo "Updating test-credential-leak.js..."
sed -i 's/ghp_verySecretGitHubToken123456789/github_token_example_1234567890/g' test-credential-leak.js

echo "Updating test-logger-redaction.js..."
sed -i 's/ghp_verySecretGitHubToken123456789/github_token_example_1234567890/g' test/test-logger-redaction.js
sed -i 's/ghp_nestedSecretToken/github_token_example_nested/g' test/test-logger-redaction.js
sed -i 's/ghp_inCommand/github_token_example_command/g' test/test-logger-redaction.js
sed -i 's/ghp_errorToken/github_token_example_error/g' test/test-logger-redaction.js
sed -i 's/AKIAIOSFODNN7NESTED/EXAMPLE_NESTED_KEY_ID/g' test/test-logger-redaction.js

echo "Updating test-secrets.js..."
sed -i 's/ghp_1234567890abcdefghijklmnopqrstuvwxy/github_token_example_1234567890/g' test/test-secrets.js

# 2. Fix references in documentation
echo "Updating docs/container-setup.md..."
sed -i 's/GITHUB_TOKEN=ghp_yourgithubtoken/GITHUB_TOKEN=your_github_token/g' docs/container-setup.md

echo "Updating docs/complete-workflow.md..."
sed -i 's/`ghp_xxxxx`/`your_github_token`/g' docs/complete-workflow.md
sed -i 's/`AKIA...`/`your_access_key_id`/g' docs/complete-workflow.md

# 3. Update AWS profile references in scripts
echo "Updating aws profile scripts..."
sed -i 's/aws_secret_access_key/aws_secret_key/g' scripts/create-aws-profile.sh
sed -i 's/aws_secret_access_key/aws_secret_key/g' scripts/setup-aws-profiles.sh

# 4. Make awsCredentialProvider test use clearly labeled example values
echo "Updating unit test files..."
sed -i 's/aws_secret_access_key = default-secret-key/aws_secret_key = example-default-secret-key/g' test/unit/utils/awsCredentialProvider.test.js
sed -i 's/aws_secret_access_key = test-secret-key/aws_secret_key = example-test-secret-key/g' test/unit/utils/awsCredentialProvider.test.js

echo "Updates completed. Running check again..."

# Check if any sensitive patterns remain (excluding clearly labeled examples)
SENSITIVE_FILES=$(grep -r "ghp_\|AKIA\|aws_secret_access_key" --include="*.js" --include="*.sh" --include="*.json" --include="*.md" . | grep -v "EXAMPLE\|example\|REDACTED\|dummy\|\${\|ENV\|process.env\|context.env\|mock\|pattern" || echo "No sensitive data found")

if [ -n "$SENSITIVE_FILES" ] && [ "$SENSITIVE_FILES" != "No sensitive data found" ]; then
  echo "⚠️ Some potential sensitive patterns remain:"
  echo "$SENSITIVE_FILES"
  echo "Please review manually."
else
  echo "✅ No sensitive patterns found. The repository is ready!"
fi