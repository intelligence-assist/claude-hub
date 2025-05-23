# GitHub PR Review Automation - Complete Guide

This guide provides comprehensive instructions for implementing automated pull request reviews using Claude Code CLI with GitHub webhook integration.

## Table of Contents

1. [Overview](#overview)
2. [Initial Setup & Data Collection](#initial-setup--data-collection)
3. [Comment Creation Methods](#comment-creation-methods)
4. [Multi-File Output Strategy](#multi-file-output-strategy)
5. [Automated Review Script Templates](#automated-review-script-templates)
6. [Review Focus Areas](#review-focus-areas)
7. [Quality Gates](#quality-gates)
8. [Advanced Techniques](#advanced-techniques)
9. [Troubleshooting](#troubleshooting)

## Overview

The automated PR review system integrates with GitHub through webhooks and uses Claude Code CLI to provide intelligent, contextual code reviews. When all checks pass for a pull request, the system automatically triggers a comprehensive review process.

### How It Works

1. **Trigger**: `check_suite` webhook event with `conclusion: 'success'`
2. **Validation**: Verify all required status checks have passed
3. **Analysis**: Claude examines the PR diff, changed files, and overall context
4. **Review**: Intelligent feedback provided through GitHub's review API
5. **Comments**: Both inline comments and general PR feedback

### Current Integration

The system already includes automated PR review functionality in:
- `src/controllers/githubController.js` (lines 404-598) - Check suite event handler
- `src/services/githubService.js` - GitHub API integration
- Webhook processing for `check_suite` completion events

## Initial Setup & Data Collection

### 1. Get PR Overview and Commit Information

```bash
# Get basic PR information
gh pr view ${PR_NUMBER} --json title,body,additions,deletions,changedFiles,files,headRefOid

# Get detailed file information  
gh pr view ${PR_NUMBER} --json files --jq '.files[] | {filename: .filename, additions: .additions, deletions: .deletions, status: .status}'

# Get the latest commit ID (required for inline comments)
COMMIT_ID=$(gh pr view ${PR_NUMBER} --json headRefOid --jq -r '.headRefOid')

# Get repository information
REPO_INFO=$(gh repo view --json owner,name)
OWNER=$(echo $REPO_INFO | jq -r '.owner.login')
REPO_NAME=$(echo $REPO_INFO | jq -r '.name')
```

### 2. Examine Changes

```bash
# Get the full diff
gh pr diff ${PR_NUMBER}

# Get diff for specific files
gh pr diff ${PR_NUMBER} -- path/to/specific/file.ext

# Save diff to file for processing
gh pr diff ${PR_NUMBER} > pr_diff.txt

# Get only the changed lines (useful for focused review)
gh pr diff ${PR_NUMBER} --name-only
```

### 3. Examine Individual Files

```bash
# Get list of changed files
CHANGED_FILES=$(gh pr view ${PR_NUMBER} --json files --jq -r '.files[].filename')

# Read specific files with context
for file in $CHANGED_FILES; do
    echo "=== Reviewing: $file ==="
    echo "File status: $(gh pr view ${PR_NUMBER} --json files --jq -r ".files[] | select(.filename==\"$file\") | .status")"
    echo "Changes: +$(gh pr view ${PR_NUMBER} --json files --jq -r ".files[] | select(.filename==\"$file\") | .additions") -$(gh pr view ${PR_NUMBER} --json files --jq -r ".files[] | select(.filename==\"$file\") | .deletions")"
    echo ""
    cat "$file"
    echo ""
done
```

## Comment Creation Methods

### Method 1: General PR Comments (Simple)

```bash
# Add general comment to PR conversation
gh pr comment ${PR_NUMBER} --body "Overall assessment: This PR looks good but has a few areas that need attention.

## Summary
- ✅ Code quality is generally good
- ⚠️  Some security considerations need addressing
- 📝 Documentation could be improved

## Next Steps
Please address the inline comments before merging."
```

### Method 2: Inline Comments (Advanced - Uses GitHub API)

**CRITICAL**: Inline comments require the GitHub REST API via `gh api` command and the latest commit SHA.

#### For Single Line Comments:

```bash
# Create inline comment on specific line
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/${OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}/comments \
  -f body="This line has a potential security vulnerability. Consider input validation here:

\`\`\`javascript
if (!input || typeof input !== 'string') {
  throw new Error('Invalid input');
}
\`\`\`" \
  -f commit_id="${COMMIT_ID}" \
  -f path="src/main.js" \
  -F line=42 \
  -f side="RIGHT"
```

#### For Multi-Line Comments (Line Range):

```bash
# Create comment spanning multiple lines
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/${OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}/comments \
  -f body="This entire function needs refactoring for better error handling:

1. Add input validation
2. Implement proper error handling
3. Consider breaking into smaller functions
4. Add unit tests for edge cases" \
  -f commit_id="${COMMIT_ID}" \
  -f path="src/utils.js" \
  -F start_line=15 \
  -F line=25 \
  -f side="RIGHT"
```

#### Parameters Explanation:

- `body`: The comment text (supports Markdown)
- `commit_id`: Latest commit SHA (get with `gh pr view --json headRefOid`)
- `path`: File path relative to repository root
- `line`: Line number for single-line comments
- `start_line` + `line`: For multi-line comments (range)
- `side`: Usually "RIGHT" (the new version of the file)

### Method 3: Comprehensive Review Submission

```bash
# Submit complete review with multiple inline comments + overall assessment
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/${OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}/reviews \
  -f commit_id="${COMMIT_ID}" \
  -f body="## Comprehensive Review Summary

This PR implements important workflow separation improvements. Overall the approach is sound, but there are several areas that need attention before merging.

### Positive Aspects
- Clean separation of CI and deployment workflows
- Proper use of GitHub Actions syntax
- Good documentation of changes

### Areas for Improvement
- Security considerations in deployment workflow
- Performance optimizations in CI workflow
- Error handling improvements needed

### Recommendation
Requesting changes to address security and performance concerns." \
  -f event="REQUEST_CHANGES" \
  -f comments='[
    {
      "path": ".github/workflows/ci.yml",
      "line": 23,
      "body": "Consider adding timeout to prevent infinite runs:\n\n```yaml\ntimeout-minutes: 10\n```"
    },
    {
      "path": ".github/workflows/deploy.yml", 
      "line": 15,
      "body": "Security: This step runs with elevated permissions. Ensure input validation:\n\n```yaml\n- name: Validate inputs\n  run: |\n    if [[ ! \"${{ github.event.inputs.environment }}\" =~ ^(staging|production)$ ]]; then\n      echo \"Invalid environment\"\n      exit 1\n    fi\n```"
    },
    {
      "path": "src/config.js",
      "start_line": 10,
      "line": 15,
      "body": "Configuration management improvement needed:\n\n1. Use environment-specific config files\n2. Add validation for required config values\n3. Consider using a config library like `dotenv`"
    }
  ]'
```

#### Review Event Types:

- `APPROVE`: Approve the PR
- `REQUEST_CHANGES`: Request changes before merge
- `COMMENT`: Provide feedback without approval/rejection

## Multi-File Output Strategy

The system should adapt its output strategy based on PR complexity:

### For Small PRs (1-3 files, <50 changes):
**Single Output**: Create one comprehensive comment with all feedback

```bash
gh pr comment ${PR_NUMBER} --body "$(cat <<'EOF'
## PR Review Summary

### Files Reviewed
- `src/main.js` (5 additions, 2 deletions)
- `tests/main.test.js` (10 additions, 0 deletions)

### Key Findings
✅ **Positive aspects:**
- Well-structured code changes
- Good test coverage added

⚠️ **Issues to address:**
- Line 42 in main.js: Add input validation
- Consider edge case testing in test file

### Recommendation
Minor changes needed before approval.
EOF
)"
```

### For Medium PRs (4-10 files, 50-200 changes):
**Two-Phase Approach**:
1. Inline comments for specific issues
2. Summary comment for overall assessment

```bash
# Phase 1: Add inline comments (multiple API calls)
create_inline_comment "src/api.js" 25 "Consider rate limiting here"
create_inline_comment "src/auth.js" 15 "Security: Validate JWT signature"

# Phase 2: Add summary comment
gh pr comment ${PR_NUMBER} --body "## Review Complete
I've added specific inline comments on files that need attention. Overall this is a solid implementation with a few security and performance considerations to address."
```

### For Large PRs (10+ files, 200+ changes):
**Three-Phase Comprehensive Review**:

1. **Security & Critical Issues First**
2. **Code Quality & Performance**
3. **Final Summary & Recommendations**

```bash
# Phase 1: Critical security review
gh pr comment ${PR_NUMBER} --body "## 🔐 Security Review
I've identified several security considerations that need immediate attention..."

# Phase 2: Code quality review  
gh pr comment ${PR_NUMBER} --body "## 📋 Code Quality Review
Performance and maintainability improvements identified..."

# Phase 3: Final summary
gh pr review ${PR_NUMBER} --request-changes --body "## Final Review Summary
This PR has significant changes that improve the system but requires addressing security and performance issues before merging."
```

## Automated Review Script Templates

### Basic Review Script

```bash
#!/bin/bash

PR_NUMBER=$1
if [ -z "$PR_NUMBER" ]; then
    echo "Usage: $0 <PR_NUMBER>"
    exit 1
fi

echo "Starting automated review for PR #${PR_NUMBER}..."

# Get repository and commit information
REPO_INFO=$(gh repo view --json owner,name)
OWNER=$(echo $REPO_INFO | jq -r '.owner.login')
REPO_NAME=$(echo $REPO_INFO | jq -r '.name')
COMMIT_ID=$(gh pr view ${PR_NUMBER} --json headRefOid --jq -r '.headRefOid')

# Get PR overview
echo "Getting PR overview..."
PR_INFO=$(gh pr view ${PR_NUMBER} --json title,body,additions,deletions,changedFiles,files)
TITLE=$(echo $PR_INFO | jq -r '.title')
CHANGED_FILES_COUNT=$(echo $PR_INFO | jq '.changedFiles')
TOTAL_ADDITIONS=$(echo $PR_INFO | jq '.additions')
TOTAL_DELETIONS=$(echo $PR_INFO | jq '.deletions')

echo "PR: $TITLE"
echo "Files changed: $CHANGED_FILES_COUNT"
echo "Changes: +$TOTAL_ADDITIONS -$TOTAL_DELETIONS"

# Determine review strategy based on PR size
if [ $CHANGED_FILES_COUNT -le 3 ] && [ $((TOTAL_ADDITIONS + TOTAL_DELETIONS)) -le 50 ]; then
    echo "Small PR detected - using single comment strategy"
    REVIEW_STRATEGY="small"
elif [ $CHANGED_FILES_COUNT -le 10 ] && [ $((TOTAL_ADDITIONS + TOTAL_DELETIONS)) -le 200 ]; then
    echo "Medium PR detected - using inline + summary strategy"
    REVIEW_STRATEGY="medium"
else
    echo "Large PR detected - using comprehensive review strategy"
    REVIEW_STRATEGY="large"
fi

# Function to create inline comment
create_inline_comment() {
    local file_path=$1
    local line_number=$2
    local comment_body=$3
    
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      /repos/${OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}/comments \
      -f body="$comment_body" \
      -f commit_id="${COMMIT_ID}" \
      -f path="$file_path" \
      -F line=$line_number \
      -f side="RIGHT"
}

# Function to submit final review
submit_review() {
    local review_body=$1
    local event_type=$2  # APPROVE, REQUEST_CHANGES, or COMMENT
    
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      /repos/${OWNER}/${REPO_NAME}/pulls/${PR_NUMBER}/reviews \
      -f commit_id="${COMMIT_ID}" \
      -f body="$review_body" \
      -f event="$event_type"
}

# Execute review based on strategy
case $REVIEW_STRATEGY in
    "small")
        # Simple single comment review
        gh pr comment ${PR_NUMBER} --body "## Automated Review Complete
        
This small PR has been reviewed. The changes look good overall.
        
### Summary
- Files reviewed: $CHANGED_FILES_COUNT
- Total changes: +$TOTAL_ADDITIONS -$TOTAL_DELETIONS

No major issues identified."
        ;;
        
    "medium")
        # Add specific inline comments then summary
        echo "Adding inline comments..."
        # Add your specific review logic here
        
        echo "Adding summary comment..."
        gh pr comment ${PR_NUMBER} --body "## Review Summary
        
I've reviewed this medium-sized PR and added inline comments where needed.
        
### Files Reviewed: $CHANGED_FILES_COUNT
### Total Changes: +$TOTAL_ADDITIONS -$TOTAL_DELETIONS

Please address the inline comments before merging."
        ;;
        
    "large")
        # Comprehensive multi-phase review
        echo "Starting comprehensive review..."
        
        # Phase 1: Security review
        gh pr comment ${PR_NUMBER} --body "## 🔐 Security Review (Phase 1/3)
        
Large PR detected. Conducting comprehensive security review first..."
        
        # Phase 2: Code quality
        gh pr comment ${PR_NUMBER} --body "## 📋 Code Quality Review (Phase 2/3)
        
Reviewing code quality and performance considerations..."
        
        # Phase 3: Final summary
        submit_review "## Final Review Summary (Phase 3/3)

This large PR ($CHANGED_FILES_COUNT files, +$TOTAL_ADDITIONS -$TOTAL_DELETIONS lines) has been comprehensively reviewed.

Please address all inline comments and security considerations before merging." "REQUEST_CHANGES"
        ;;
esac

echo "Automated review complete for PR #${PR_NUMBER}"
```

### Advanced Security-Focused Review Script

```bash
#!/bin/bash

# Advanced security-focused PR review script
PR_NUMBER=$1

# Security patterns to check
declare -A SECURITY_PATTERNS=(
    ["SQL_INJECTION"]="(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE).*\$\{|\$\("
    ["XSS_VULNERABLE"]="innerHTML|document\.write|eval\(|new Function"
    ["HARDCODED_SECRETS"]="(password|secret|key|token)\s*=\s*['\"][^'\"]{8,}"
    ["UNSAFE_FILE_OPS"]="../|\.\.\\|/etc/|/var/|/tmp/"
    ["CRYPTO_WEAK"]="md5|sha1|des|rc4"
)

# Function to scan for security issues
scan_security_issues() {
    local file_path=$1
    local issues_found=()
    
    for pattern_name in "${!SECURITY_PATTERNS[@]}"; do
        local pattern="${SECURITY_PATTERNS[$pattern_name]}"
        local matches=$(grep -n -i -E "$pattern" "$file_path" || true)
        
        if [ ! -z "$matches" ]; then
            while IFS= read -r line; do
                local line_num=$(echo "$line" | cut -d: -f1)
                local content=$(echo "$line" | cut -d: -f2-)
                
                case $pattern_name in
                    "SQL_INJECTION")
                        create_inline_comment "$file_path" "$line_num" "🚨 **Potential SQL Injection**: This line appears to construct SQL queries dynamically. Use parameterized queries instead."
                        ;;
                    "XSS_VULNERABLE")
                        create_inline_comment "$file_path" "$line_num" "🚨 **XSS Risk**: Direct DOM manipulation detected. Sanitize user input before insertion."
                        ;;
                    "HARDCODED_SECRETS")
                        create_inline_comment "$file_path" "$line_num" "🚨 **Hardcoded Secret**: Never commit secrets in code. Use environment variables instead."
                        ;;
                    "UNSAFE_FILE_OPS")
                        create_inline_comment "$file_path" "$line_num" "🚨 **Path Traversal Risk**: Validate file paths to prevent directory traversal attacks."
                        ;;
                    "CRYPTO_WEAK")
                        create_inline_comment "$file_path" "$line_num" "🚨 **Weak Cryptography**: Use stronger cryptographic algorithms (SHA-256, AES-256, etc.)."
                        ;;
                esac
                
                issues_found+=("$pattern_name:$line_num")
            done <<< "$matches"
        fi
    done
    
    echo "${#issues_found[@]}"
}

# Main security review execution
echo "🔐 Starting security-focused review for PR #${PR_NUMBER}..."

TOTAL_SECURITY_ISSUES=0
CHANGED_FILES=$(gh pr view ${PR_NUMBER} --json files --jq -r '.files[].filename')

for file in $CHANGED_FILES; do
    if [[ -f "$file" ]]; then
        echo "Scanning security issues in: $file"
        ISSUES_COUNT=$(scan_security_issues "$file")
        TOTAL_SECURITY_ISSUES=$((TOTAL_SECURITY_ISSUES + ISSUES_COUNT))
    fi
done

# Final security assessment
if [ $TOTAL_SECURITY_ISSUES -gt 0 ]; then
    submit_review "## 🚨 Security Review: Issues Found

**$TOTAL_SECURITY_ISSUES security issues** identified in this PR that must be addressed before merging.

### Critical Actions Required:
1. Review all inline security comments
2. Implement suggested security fixes
3. Run security tests before requesting re-review
4. Consider security code review by team lead

**Note**: This is an automated security scan. Manual security review may identify additional issues." "REQUEST_CHANGES"
else
    gh pr comment ${PR_NUMBER} --body "## ✅ Security Review: Clean

No obvious security vulnerabilities detected in the automated scan.

**Note**: This automated scan covers common patterns but doesn't replace manual security review for sensitive changes."
fi

echo "Security review complete. Issues found: $TOTAL_SECURITY_ISSUES"
```

## Review Focus Areas by File Type

### Workflow Files (.github/workflows/*.yml)

```bash
review_workflow_file() {
    local file=$1
    local issues=()
    
    # Check for security issues
    if grep -q "pull_request_target" "$file"; then
        issues+=("Line $(grep -n "pull_request_target" "$file" | cut -d: -f1): Use pull_request_target with extreme caution - potential security risk")
    fi
    
    # Check for missing timeouts
    if ! grep -q "timeout-minutes" "$file"; then
        issues+=("Consider adding timeout-minutes to prevent runaway workflows")
    fi
    
    # Check for secrets usage
    local secrets_lines=$(grep -n "secrets\." "$file" || true)
    if [ ! -z "$secrets_lines" ]; then
        while IFS= read -r line; do
            local line_num=$(echo "$line" | cut -d: -f1)
            issues+=("Line $line_num: Verify this secret is necessary and properly scoped")
        done <<< "$secrets_lines"
    fi
    
    # Report issues
    for issue in "${issues[@]}"; do
        echo "Workflow Issue: $issue"
    done
}
```

### JavaScript/TypeScript Files

```bash
review_js_file() {
    local file=$1
    
    # Check for missing error handling
    local try_blocks=$(grep -c "try {" "$file" 2>/dev/null || echo "0")
    local catch_blocks=$(grep -c "catch" "$file" 2>/dev/null || echo "0")
    
    if [ $try_blocks -ne $catch_blocks ]; then
        echo "Error handling mismatch: $try_blocks try blocks vs $catch_blocks catch blocks"
    fi
    
    # Check for console.log statements (should be removed in production)
    local console_logs=$(grep -n "console\.log" "$file" || true)
    if [ ! -z "$console_logs" ]; then
        while IFS= read -r line; do
            local line_num=$(echo "$line" | cut -d: -f1)
            create_inline_comment "$file" "$line_num" "Consider removing console.log statements in production code. Use a proper logging library instead."
        done <<< "$console_logs"
    fi
    
    # Check for TODO/FIXME comments
    local todos=$(grep -n -i "TODO\|FIXME\|HACK" "$file" || true)
    if [ ! -z "$todos" ]; then
        echo "Found TODO/FIXME comments that should be addressed"
    fi
}
```

### Configuration Files (*.json, *.yaml, *.toml)

```bash
review_config_file() {
    local file=$1
    
    # Check for potential secrets in config
    local potential_secrets=$(grep -i -n "password\|secret\|key\|token" "$file" | grep -v "password_field\|secret_name" || true)
    if [ ! -z "$potential_secrets" ]; then
        while IFS= read -r line; do
            local line_num=$(echo "$line" | cut -d: -f1)
            create_inline_comment "$file" "$line_num" "⚠️ Potential secret detected. Ensure this value is not hardcoded and uses environment variables or secure storage."
        done <<< "$potential_secrets"
    fi
    
    # Validate JSON syntax if it's a JSON file
    if [[ "$file" == *.json ]]; then
        if ! jq empty "$file" 2>/dev/null; then
            echo "JSON syntax error in $file"
        fi
    fi
}
```

## Quality Gates

### Must Address (REQUEST_CHANGES):

1. **Security vulnerabilities**
2. **Breaking changes without proper migration**
3. **Critical logic errors**
4. **Workflow infinite loops or failures**
5. **Hardcoded secrets or credentials**

```bash
# Example: Automatic REQUEST_CHANGES for critical issues
CRITICAL_ISSUES=0

# Check for hardcoded secrets
if grep -r -i "password\s*=\s*['\"][^'\"]{8,}" . --include="*.js" --include="*.ts" --include="*.py"; then
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
fi

# Check for SQL injection patterns
if grep -r "SELECT.*\$\{" . --include="*.js" --include="*.ts"; then
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
fi

if [ $CRITICAL_ISSUES -gt 0 ]; then
    submit_review "🚨 Critical security issues found that must be fixed before merging." "REQUEST_CHANGES"
fi
```

### Should Address (COMMENT):

1. **Performance improvements**
2. **Code organization**
3. **Missing error handling**
4. **Documentation gaps**
5. **Test coverage issues**

### Nice to Have (APPROVE with comments):

1. **Code style preferences**
2. **Minor optimizations**
3. **Suggestions for future iterations**

## Advanced Techniques

### Contextual Review Based on File Changes

```bash
# Smart review based on what actually changed
analyze_change_context() {
    local file=$1
    local diff_output=$(gh pr diff ${PR_NUMBER} -- "$file")
    
    # Extract only the changed lines
    local added_lines=$(echo "$diff_output" | grep "^+" | grep -v "^+++" | sed 's/^+//')
    local removed_lines=$(echo "$diff_output" | grep "^-" | grep -v "^---" | sed 's/^-//')
    
    # Analyze added lines for common issues
    echo "$added_lines" | while IFS= read -r line; do
        if [[ "$line" =~ console\.log ]]; then
            echo "Added console.log statement"
        elif [[ "$line" =~ TODO|FIXME ]]; then
            echo "Added TODO/FIXME comment"
        elif [[ "$line" =~ password|secret|key.*= ]]; then
            echo "Potential secret added"
        fi
    done
}
```

### PR Size-Based Review Strategies

```bash
determine_review_depth() {
    local changed_files=$1
    local total_changes=$2
    
    if [ $changed_files -le 3 ] && [ $total_changes -le 50 ]; then
        echo "quick"  # Quick review, basic checks
    elif [ $changed_files -le 10 ] && [ $total_changes -le 200 ]; then
        echo "standard"  # Standard review with inline comments
    elif [ $changed_files -le 20 ] && [ $total_changes -le 500 ]; then
        echo "thorough"  # Thorough review with security focus
    else
        echo "comprehensive"  # Break into multiple review sessions
    fi
}
```

### Intelligent Comment Grouping

```bash
# Group related comments by file and concern type
declare -A COMMENTS_BY_FILE
declare -A COMMENTS_BY_TYPE

add_grouped_comment() {
    local file=$1
    local line=$2
    local type=$3  # security, performance, style, logic
    local comment=$4
    
    COMMENTS_BY_FILE["$file"]+="Line $line ($type): $comment\n"
    COMMENTS_BY_TYPE["$type"]+="$file:$line - $comment\n"
}

# Create summary comments grouped by concern type
create_summary_by_type() {
    for type in security performance style logic; do
        if [ ! -z "${COMMENTS_BY_TYPE[$type]}" ]; then
            gh pr comment ${PR_NUMBER} --body "## ${type^} Issues

${COMMENTS_BY_TYPE[$type]}"
        fi
    done
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. "Not Found" errors
```bash
# Check repository access
gh api /repos/${OWNER}/${REPO_NAME}

# Verify PR exists
gh pr view ${PR_NUMBER} --json number,title
```

#### 2. "Invalid commit" errors
```bash
# Ensure you have the latest commit ID
COMMIT_ID=$(gh pr view ${PR_NUMBER} --json headRefOid --jq -r '.headRefOid')
echo "Using commit: $COMMIT_ID"

# Verify commit exists
gh api /repos/${OWNER}/${REPO_NAME}/commits/${COMMIT_ID}
```

#### 3. Line number errors
```bash
# Line numbers in diff format vs absolute file lines
# Use diff context to find correct line numbers
gh pr diff ${PR_NUMBER} --name-only | while read file; do
    echo "=== $file ==="
    gh pr diff ${PR_NUMBER} -- "$file" | grep -n "@@"
done
```

#### 4. Permission errors
```bash
# Check GitHub token permissions
gh auth status

# Verify token has repo and pull_requests scopes
gh api user -q .login
```

### Debug Commands

```bash
# Verify repository access and PR information
debug_pr_access() {
    local pr_number=$1
    
    echo "=== Debugging PR Access ==="
    echo "Repository: $(gh repo view --json owner,name --jq '.owner.login + "/" + .name')"
    echo "PR Number: $pr_number"
    
    # Check if PR exists
    if gh pr view $pr_number >/dev/null 2>&1; then
        echo "✅ PR exists and is accessible"
        
        # Get PR details
        echo "PR Title: $(gh pr view $pr_number --json title --jq -r '.title')"
        echo "PR State: $(gh pr view $pr_number --json state --jq -r '.state')"
        echo "Head SHA: $(gh pr view $pr_number --json headRefOid --jq -r '.headRefOid')"
        
        # Check files
        local file_count=$(gh pr view $pr_number --json files --jq '.files | length')
        echo "Changed Files: $file_count"
        
        if [ $file_count -gt 0 ]; then
            echo "Files:"
            gh pr view $pr_number --json files --jq -r '.files[].filename' | head -5
        fi
    else
        echo "❌ PR not accessible or doesn't exist"
        echo "Available PRs:"
        gh pr list --limit 5 --json number,title
    fi
}

# Test API access
test_api_access() {
    echo "=== Testing GitHub API Access ==="
    
    # Test basic API access
    if gh api user >/dev/null 2>&1; then
        echo "✅ GitHub API access working"
        echo "User: $(gh api user --jq -r '.login')"
    else
        echo "❌ GitHub API access failed"
        echo "Check: gh auth status"
        return 1
    fi
    
    # Test repository access
    local repo=$(gh repo view --json owner,name --jq -r '.owner.login + "/" + .name')
    if gh api "/repos/$repo" >/dev/null 2>&1; then
        echo "✅ Repository access working: $repo"
    else
        echo "❌ Repository access failed: $repo"
        return 1
    fi
}

# Validate inline comment parameters
validate_comment_params() {
    local file_path=$1
    local line_number=$2
    local commit_id=$3
    
    echo "=== Validating Comment Parameters ==="
    echo "File: $file_path"
    echo "Line: $line_number"
    echo "Commit: $commit_id"
    
    # Check if file exists
    if [ -f "$file_path" ]; then
        echo "✅ File exists"
        local total_lines=$(wc -l < "$file_path")
        echo "Total lines: $total_lines"
        
        if [ $line_number -le $total_lines ]; then
            echo "✅ Line number valid"
        else
            echo "❌ Line number $line_number exceeds file length $total_lines"
        fi
    else
        echo "❌ File not found: $file_path"
    fi
    
    # Validate commit ID format
    if [[ $commit_id =~ ^[a-f0-9]{40}$ ]]; then
        echo "✅ Commit ID format valid"
    else
        echo "❌ Invalid commit ID format: $commit_id"
    fi
}
```

### Performance Optimization

```bash
# Batch API calls for efficiency
batch_inline_comments() {
    local pr_number=$1
    local -n comments_array=$2  # Pass array by reference
    
    # Prepare all comments in JSON format
    local comments_json="["
    local first=true
    
    for comment in "${comments_array[@]}"; do
        if [ "$first" = true ]; then
            first=false
        else
            comments_json+=","
        fi
        comments_json+="$comment"
    done
    comments_json+="]"
    
    # Submit all comments in a single review
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      /repos/${OWNER}/${REPO_NAME}/pulls/${pr_number}/reviews \
      -f commit_id="${COMMIT_ID}" \
      -f body="Automated review with inline comments" \
      -f event="COMMENT" \
      --input <(echo "$comments_json" | jq '{comments: .}')
}
```

This comprehensive guide provides all the tools and techniques needed to implement sophisticated automated PR reviews using the existing Claude webhook infrastructure. The integration with the current system allows for seamless automated reviews triggered by successful check suites, while providing flexibility for manual review invocation as well.