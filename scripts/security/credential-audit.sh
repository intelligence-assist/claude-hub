#!/bin/bash

# Credential Security Audit Script
# This script performs comprehensive credential scanning and security checks

set -e

echo "🔒 Starting Credential Security Audit..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track issues found
ISSUES_FOUND=0

# Function to report issues
report_issue() {
    echo -e "${RED}❌ SECURITY ISSUE: $1${NC}"
    ((ISSUES_FOUND++))
}

report_warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
}

report_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# 1. Check for .env files that shouldn't be committed
echo "🔍 Checking for exposed .env files..."
if find . -name ".env*" -not -path "./node_modules/*" -not -name ".env.example" -not -name ".env.template" | grep -q .; then
    find . -name ".env*" -not -path "./node_modules/*" -not -name ".env.example" -not -name ".env.template" | while read file; do
        report_issue "Found .env file that may contain secrets: $file"
    done
else
    report_success "No exposed .env files found"
fi

# 2. Scan for hardcoded API keys and tokens
echo "🔍 Scanning for hardcoded credentials..."
CREDENTIAL_PATTERNS=(
    "sk-[a-zA-Z0-9-_]{40,}"  # Anthropic API keys
    "ghp_[a-zA-Z0-9]{36}"    # GitHub personal access tokens
    "AKIA[0-9A-Z]{16}"       # AWS access key IDs
    "xox[boas]-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[a-z0-9]{32}" # Slack tokens
    "AIza[0-9A-Za-z\\-_]{35}" # Google API keys
)

for pattern in "${CREDENTIAL_PATTERNS[@]}"; do
    # Skip AWS key ID checks in test/integration directory - these are fake test keys
    if [[ "$pattern" == "AKIA[0-9A-Z]{16}" && -d "./test/integration" ]]; then
        GREP_RESULT=$(grep -rE "$pattern" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=coverage --exclude-dir=test/integration --exclude="credential-audit.sh" --exclude="test-logger-redaction.js" --exclude="test-logger-redaction-comprehensive.js" . 2>/dev/null)
    else
        GREP_RESULT=$(grep -rE "$pattern" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=coverage --exclude="credential-audit.sh" --exclude="test-logger-redaction.js" --exclude="test-logger-redaction-comprehensive.js" . 2>/dev/null)
    fi
    
    if [[ -n "$GREP_RESULT" ]]; then
        echo "$GREP_RESULT"
        report_issue "Found potential hardcoded credentials matching pattern: $pattern"
    fi
done

# 3. Check git history for leaked credentials (last 10 commits)
echo "🔍 Checking recent git history for credentials..."
for pattern in "${CREDENTIAL_PATTERNS[@]}"; do
    if git log --oneline -10 | xargs -I {} git show {} | grep -qE "$pattern" 2>/dev/null; then
        report_warning "Found potential credentials in git history (pattern: $pattern)"
        echo "   Consider using 'git filter-branch' or 'BFG Repo-Cleaner' to remove them"
    fi
done

# 4. Check file permissions
echo "🔍 Checking file permissions..."
if find . -name "*.key" -o -name "*.pem" -o -name "*.crt" -o -name ".env*" 2>/dev/null | xargs ls -la 2>/dev/null | grep -v "^-rw-------"; then
    report_warning "Found credential files with overly permissive permissions"
    echo "   Consider running: chmod 600 on credential files"
fi

# 5. Check for AWS credentials file
if [ -f "$HOME/.aws/credentials" ]; then
    if [ "$(stat -c %a "$HOME/.aws/credentials" 2>/dev/null)" != "600" ]; then
        report_warning "AWS credentials file has overly permissive permissions"
        echo "   Run: chmod 600 ~/.aws/credentials"
    else
        report_success "AWS credentials file has proper permissions"
    fi
fi

# 6. Verify .gitignore coverage
echo "🔍 Checking .gitignore coverage..."
SHOULD_BE_IGNORED=(
    ".env"
    "*.key"
    "*.pem"
    "credentials"
    "config"
    "auth.json"
)

for item in "${SHOULD_BE_IGNORED[@]}"; do
    if ! grep -q "$item" .gitignore 2>/dev/null; then
        report_warning ".gitignore missing pattern: $item"
    fi
done

# 7. Check for pre-commit hooks
echo "🔍 Checking security tools..."
if [ ! -f ".pre-commit-config.yaml" ]; then
    report_issue "No pre-commit configuration found"
else
    if grep -q "detect-secrets" .pre-commit-config.yaml && grep -q "gitleaks" .pre-commit-config.yaml; then
        report_success "Pre-commit security tools configured"
    else
        report_warning "Pre-commit missing security tools (detect-secrets, gitleaks)"
    fi
fi

# 8. Check environment variable exposure in logs/debug output
echo "🔍 Checking for environment variable exposure..."
if grep -r "process.env\|os.environ\|ENV\[" --include="*.js" --include="*.py" --include="*.log" --exclude-dir=node_modules . 2>/dev/null | grep -v "process.env.NODE_ENV" | head -5 | grep -q .; then
    report_warning "Found potential environment variable exposure in code/logs"
    echo "   Review the following files for credential leaks:"
    grep -r "process.env\|os.environ\|ENV\[" --include="*.js" --include="*.py" --include="*.log" --exclude-dir=node_modules . 2>/dev/null | grep -v "process.env.NODE_ENV" | head -5
fi

# Summary
echo ""
echo "📊 Security Audit Summary:"
if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ No critical security issues found!${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ISSUES_FOUND security issue(s) that need attention${NC}"
    exit 1
fi