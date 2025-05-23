#!/bin/bash

# Security-Focused PR Review Script
# Usage: ./security-focused-review.sh <PR_NUMBER>

set -e

PR_NUMBER=$1
if [ -z "$PR_NUMBER" ]; then
    echo "Usage: $0 <PR_NUMBER>"
    echo "Example: $0 42"
    exit 1
fi

echo "🔐 Starting security-focused review for PR #${PR_NUMBER}..."

# Get repository information
REPO_INFO=$(gh repo view --json owner,name 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ Error: Could not access repository"
    exit 1
fi

OWNER=$(echo "$REPO_INFO" | jq -r '.owner.login')
REPO_NAME=$(echo "$REPO_INFO" | jq -r '.name')
COMMIT_ID=$(gh pr view "$PR_NUMBER" --json headRefOid --jq -r '.headRefOid')

echo "🏢 Repository: $OWNER/$REPO_NAME"
echo "📍 Commit: ${COMMIT_ID:0:8}..."

# Security patterns to check for
declare -A SECURITY_PATTERNS=(
    ["SQL_INJECTION"]="(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*[\$\`]|query.*[\+\&].*request"
    ["XSS_VULNERABLE"]="innerHTML|document\.write|eval\(|new Function|dangerouslySetInnerHTML"
    ["HARDCODED_SECRETS"]="(password|secret|key|token|api_key|private_key)\s*[:=]\s*['\"][^'\"]{8,}['\"]"
    ["UNSAFE_FILE_OPS"]="\.\.\/|\.\.\\\\|\/etc\/|\/var\/|\/tmp\/|path\.join.*\.\."
    ["CRYPTO_WEAK"]="md5|sha1|des|rc4|md4|ripemd"
    ["UNSAFE_RANDOM"]="Math\.random|rand\(\)|random\(\).*password|random\(\).*token"
    ["UNSAFE_DESERIALIZATION"]="pickle\.loads|json\.loads.*request|unserialize|yaml\.load[^_]"
    ["COMMAND_INJECTION"]="exec\(|system\(|shell_exec|passthru|proc_open"
    ["UNSAFE_REDIRECT"]="redirect.*request|location\.href.*request|window\.location.*request"
    ["WEAK_VALIDATION"]="strip_tags|addslashes|magic_quotes"
)

# Security severity levels
declare -A SEVERITY_LEVELS=(
    ["SQL_INJECTION"]="CRITICAL"
    ["XSS_VULNERABLE"]="HIGH"
    ["HARDCODED_SECRETS"]="CRITICAL"
    ["UNSAFE_FILE_OPS"]="HIGH"
    ["CRYPTO_WEAK"]="MEDIUM"
    ["UNSAFE_RANDOM"]="MEDIUM"
    ["UNSAFE_DESERIALIZATION"]="CRITICAL"
    ["COMMAND_INJECTION"]="CRITICAL"
    ["UNSAFE_REDIRECT"]="MEDIUM"
    ["WEAK_VALIDATION"]="LOW"
)

# Function to get security issue description
get_security_description() {
    local pattern_name=$1
    case $pattern_name in
        "SQL_INJECTION")
            echo "🚨 **SQL Injection Risk**: This code appears to construct SQL queries using user input. Use parameterized queries or prepared statements instead."
            ;;
        "XSS_VULNERABLE")
            echo "🚨 **XSS Vulnerability**: Direct DOM manipulation detected. Sanitize user input and use safe methods like textContent instead of innerHTML."
            ;;
        "HARDCODED_SECRETS")
            echo "🚨 **Hardcoded Secret**: Never commit secrets, passwords, or API keys in code. Use environment variables or secure credential storage."
            ;;
        "UNSAFE_FILE_OPS")
            echo "🚨 **Path Traversal Risk**: File operations with user-controlled paths detected. Validate and sanitize file paths to prevent directory traversal attacks."
            ;;
        "CRYPTO_WEAK")
            echo "⚠️ **Weak Cryptography**: Using outdated or weak cryptographic algorithms. Use SHA-256+ for hashing and AES-256+ for encryption."
            ;;
        "UNSAFE_RANDOM")
            echo "⚠️ **Cryptographically Insecure Random**: Math.random() is not cryptographically secure. Use crypto.randomBytes() for security-sensitive operations."
            ;;
        "UNSAFE_DESERIALIZATION")
            echo "🚨 **Unsafe Deserialization**: Deserializing untrusted data can lead to remote code execution. Validate and sanitize input before deserialization."
            ;;
        "COMMAND_INJECTION")
            echo "🚨 **Command Injection**: Executing system commands with user input. Use parameterized commands or input validation/sanitization."
            ;;
        "UNSAFE_REDIRECT")
            echo "⚠️ **Open Redirect**: Redirecting to user-controlled URLs. Validate redirect destinations against an allowlist."
            ;;
        "WEAK_VALIDATION")
            echo "💡 **Weak Input Validation**: These functions provide insufficient protection. Use proper input validation and sanitization libraries."
            ;;
        *)
            echo "⚠️ **Security Issue**: Potential security concern detected. Please review this code carefully."
            ;;
    esac
}

# Function to create security-focused inline comment
create_security_comment() {
    local file_path=$1
    local line_number=$2
    local pattern_name=$3
    local matched_content=$4
    local severity=${SEVERITY_LEVELS[$pattern_name]}
    
    local description=$(get_security_description "$pattern_name")
    
    # Add severity badge and additional context
    local comment_body="$description

**Severity**: $severity  
**Pattern**: $pattern_name  
**Matched**: \`$(echo "$matched_content" | sed 's/[`]/\\`/g')\`

### Recommended Actions:
$(case $pattern_name in
    "SQL_INJECTION")
        echo "- Use prepared statements or parameterized queries
- Validate and sanitize all user inputs
- Consider using an ORM with built-in protection"
        ;;
    "XSS_VULNERABLE")
        echo "- Use textContent instead of innerHTML for user data
- Implement Content Security Policy (CSP)
- Sanitize input with libraries like DOMPurify"
        ;;
    "HARDCODED_SECRETS")
        echo "- Move secrets to environment variables
- Use a secrets management service
- Add this pattern to .gitignore and secret scanning"
        ;;
    "UNSAFE_FILE_OPS")
        echo "- Validate file paths against allowed directories
- Use path.resolve() and check if result is within allowed bounds
- Implement proper access controls"
        ;;
    *)
        echo "- Review code for security implications
- Consider security testing
- Follow security best practices for this technology"
        ;;
esac)"
    
    echo "🚨 Creating security comment: $file_path:$line_number ($severity)"
    
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "/repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments" \
      -f body="$comment_body" \
      -f commit_id="$COMMIT_ID" \
      -f path="$file_path" \
      -F line="$line_number" \
      -f side="RIGHT" || {
        echo "❌ Failed to create security comment for $file_path:$line_number"
        return 1
    }
}

# Function to scan file for security issues
scan_security_issues() {
    local file_path=$1
    local issues_found=0
    local critical_issues=0
    local high_issues=0
    local medium_issues=0
    local low_issues=0
    
    if [ ! -f "$file_path" ]; then
        echo "⚠️ File not found: $file_path"
        return 0
    fi
    
    echo "🔍 Security scanning: $file_path"
    
    for pattern_name in "${!SECURITY_PATTERNS[@]}"; do
        local pattern="${SECURITY_PATTERNS[$pattern_name]}"
        local severity="${SEVERITY_LEVELS[$pattern_name]}"
        
        # Search for pattern in file
        local matches=$(grep -n -i -E "$pattern" "$file_path" 2>/dev/null || true)
        
        if [ -n "$matches" ]; then
            while IFS= read -r line; do
                local line_num=$(echo "$line" | cut -d: -f1)
                local content=$(echo "$line" | cut -d: -f2-)
                
                # Count issues by severity
                case $severity in
                    "CRITICAL") critical_issues=$((critical_issues + 1)) ;;
                    "HIGH") high_issues=$((high_issues + 1)) ;;
                    "MEDIUM") medium_issues=$((medium_issues + 1)) ;;
                    "LOW") low_issues=$((low_issues + 1)) ;;
                esac
                
                create_security_comment "$file_path" "$line_num" "$pattern_name" "$content"
                issues_found=$((issues_found + 1))
                
            done <<< "$matches"
        fi
    done
    
    # Store severity counts for summary (using global variables)
    TOTAL_CRITICAL=$((TOTAL_CRITICAL + critical_issues))
    TOTAL_HIGH=$((TOTAL_HIGH + high_issues))
    TOTAL_MEDIUM=$((TOTAL_MEDIUM + medium_issues))
    TOTAL_LOW=$((TOTAL_LOW + low_issues))
    
    if [ $issues_found -gt 0 ]; then
        echo "⚠️  Security issues found in $file_path: $issues_found (Critical: $critical_issues, High: $high_issues, Medium: $medium_issues, Low: $low_issues)"
    else
        echo "✅ No security patterns detected in $file_path"
    fi
    
    return $issues_found
}

# Function to check for additional security concerns
additional_security_checks() {
    local file_path=$1
    local additional_issues=0
    
    # Check for sensitive file patterns
    case "$file_path" in
        *.env*|*.key|*.pem|*.crt|*.p12|*.pfx)
            if [ -f "$file_path" ]; then
                echo "🚨 Sensitive file type detected: $file_path"
                gh pr comment "$PR_NUMBER" --body "🚨 **Security Alert**: Sensitive file \`$file_path\` detected in PR. 

**Risk**: This file type often contains secrets or credentials.

**Actions Required**:
- Verify this file doesn't contain actual secrets
- Consider adding to .gitignore if it's a template
- Use proper secrets management for actual credentials"
                additional_issues=$((additional_issues + 1))
            fi
            ;;
        *docker*|*Dockerfile*)
            if [ -f "$file_path" ]; then
                echo "🔍 Docker file detected: $file_path"
                # Check for common Docker security issues
                if grep -q "FROM.*:latest" "$file_path"; then
                    echo "⚠️ Docker using :latest tag in $file_path"
                fi
                if grep -q "USER root\|--privileged" "$file_path"; then
                    echo "⚠️ Docker running as root or privileged in $file_path"
                fi
            fi
            ;;
        *.github/workflows/*|*.yml|*.yaml)
            if [[ "$file_path" == *"workflow"* ]] && [ -f "$file_path" ]; then
                echo "🔍 Workflow file detected: $file_path"
                # Already handled in main scan, but could add workflow-specific checks
            fi
            ;;
    esac
    
    return $additional_issues
}

# Main security scan execution
echo ""
echo "🛡️  Starting comprehensive security scan..."
echo "=========================================="

# Initialize severity counters
TOTAL_CRITICAL=0
TOTAL_HIGH=0
TOTAL_MEDIUM=0
TOTAL_LOW=0
TOTAL_SECURITY_ISSUES=0
TOTAL_ADDITIONAL_ISSUES=0

# Get changed files
PR_INFO=$(gh pr view "$PR_NUMBER" --json files)
CHANGED_FILES=$(echo "$PR_INFO" | jq -r '.files[].filename')

if [ -z "$CHANGED_FILES" ]; then
    echo "❌ No files found in PR or error accessing PR"
    exit 1
fi

echo "📁 Files to scan:"
echo "$CHANGED_FILES" | sed 's/^/  - /'
echo ""

# Scan each file
while IFS= read -r file; do
    if [ -n "$file" ]; then
        scan_security_issues "$file"
        TOTAL_SECURITY_ISSUES=$((TOTAL_SECURITY_ISSUES + $?))
        
        additional_security_checks "$file"
        TOTAL_ADDITIONAL_ISSUES=$((TOTAL_ADDITIONAL_ISSUES + $?))
    fi
done <<< "$CHANGED_FILES"

echo ""
echo "📊 Security scan complete!"
echo "=========================="
echo "🚨 Critical issues: $TOTAL_CRITICAL"
echo "⚠️  High issues: $TOTAL_HIGH"
echo "💛 Medium issues: $TOTAL_MEDIUM"
echo "💙 Low issues: $TOTAL_LOW"
echo "📋 Additional concerns: $TOTAL_ADDITIONAL_ISSUES"
echo "📈 Total security issues: $TOTAL_SECURITY_ISSUES"

# Determine review outcome based on severity
if [ $TOTAL_CRITICAL -gt 0 ]; then
    REVIEW_EVENT="REQUEST_CHANGES"
    REVIEW_EMOJI="🚨"
    REVIEW_STATUS="CRITICAL ISSUES FOUND"
elif [ $TOTAL_HIGH -gt 0 ]; then
    REVIEW_EVENT="REQUEST_CHANGES"
    REVIEW_EMOJI="⚠️"
    REVIEW_STATUS="HIGH SEVERITY ISSUES FOUND"
elif [ $TOTAL_MEDIUM -gt 5 ]; then
    REVIEW_EVENT="REQUEST_CHANGES"
    REVIEW_EMOJI="⚠️"
    REVIEW_STATUS="MULTIPLE MEDIUM ISSUES FOUND"
elif [ $TOTAL_SECURITY_ISSUES -gt 0 ]; then
    REVIEW_EVENT="COMMENT"
    REVIEW_EMOJI="💛"
    REVIEW_STATUS="MINOR ISSUES IDENTIFIED"
else
    REVIEW_EVENT="COMMENT"
    REVIEW_EMOJI="✅"
    REVIEW_STATUS="NO SECURITY ISSUES DETECTED"
fi

# Submit comprehensive security review
echo ""
echo "📝 Submitting security review..."

REVIEW_BODY="# $REVIEW_EMOJI Security Review: $REVIEW_STATUS

## Security Scan Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🚨 Critical | $TOTAL_CRITICAL | $([ $TOTAL_CRITICAL -eq 0 ] && echo "✅ Clean" || echo "❌ Action Required") |
| ⚠️ High | $TOTAL_HIGH | $([ $TOTAL_HIGH -eq 0 ] && echo "✅ Clean" || echo "❌ Action Required") |
| 💛 Medium | $TOTAL_MEDIUM | $([ $TOTAL_MEDIUM -eq 0 ] && echo "✅ Clean" || echo "⚠️ Review Recommended") |
| 💙 Low | $TOTAL_LOW | $([ $TOTAL_LOW -eq 0 ] && echo "✅ Clean" || echo "💡 Informational") |

**Total Issues Found**: $TOTAL_SECURITY_ISSUES

## Analysis Results

$(if [ $TOTAL_SECURITY_ISSUES -eq 0 ]; then
    echo "✅ **Clean Scan**: No obvious security vulnerabilities detected in the automated scan.

### What was checked:
- SQL injection patterns
- Cross-site scripting (XSS) vulnerabilities  
- Hardcoded secrets and credentials
- Path traversal vulnerabilities
- Weak cryptography usage
- Command injection patterns
- Unsafe deserialization
- Open redirect vulnerabilities

### Note
This automated scan covers common security patterns but doesn't replace manual security review for sensitive changes."
else
    echo "⚠️ **Issues Identified**: The automated scan detected potential security vulnerabilities that require attention.

### Critical Actions Required:
$([ $TOTAL_CRITICAL -gt 0 ] && echo "- 🚨 **$TOTAL_CRITICAL Critical issues** must be fixed before merging")
$([ $TOTAL_HIGH -gt 0 ] && echo "- ⚠️ **$TOTAL_HIGH High severity issues** should be addressed") 
$([ $TOTAL_MEDIUM -gt 0 ] && echo "- 💛 **$TOTAL_MEDIUM Medium issues** recommended for review")
$([ $TOTAL_LOW -gt 0 ] && echo "- 💙 **$TOTAL_LOW Low priority items** for consideration")

### Next Steps:
1. 📋 Review all inline security comments
2. 🔧 Implement suggested security fixes  
3. 🧪 Test security controls
4. 🔍 Consider additional manual security review
5. 📚 Review security documentation and best practices"
fi)

## Recommendation

$(if [ $TOTAL_CRITICAL -gt 0 ] || [ $TOTAL_HIGH -gt 0 ]; then
    echo "**❌ Do not merge** until critical and high severity issues are resolved."
elif [ $TOTAL_MEDIUM -gt 5 ]; then
    echo "**⚠️ Address issues** before merging. Multiple medium severity issues detected."
elif [ $TOTAL_SECURITY_ISSUES -gt 0 ]; then
    echo "**💛 Review recommended** but not blocking. Address issues when feasible."
else
    echo "**✅ Security scan passed** - no obvious vulnerabilities detected."
fi)

---
🤖 *This automated security review was generated by Claude Code. For comprehensive security assurance, consider additional manual review and security testing.*"

# Submit the review
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/reviews" \
  -f commit_id="$COMMIT_ID" \
  -f body="$REVIEW_BODY" \
  -f event="$REVIEW_EVENT" || {
    echo "❌ Failed to submit security review"
    exit 1
}

echo ""
echo "✅ Security review complete for PR #$PR_NUMBER"
echo "🔗 View PR: https://github.com/$OWNER/$REPO_NAME/pull/$PR_NUMBER"
echo ""
echo "Summary: $REVIEW_STATUS"
echo "Action: $REVIEW_EVENT"