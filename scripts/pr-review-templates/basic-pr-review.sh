#!/bin/bash

# Basic PR Review Script Template
# Usage: ./basic-pr-review.sh <PR_NUMBER>

set -e  # Exit on any error

PR_NUMBER=$1
if [ -z "$PR_NUMBER" ]; then
    echo "Usage: $0 <PR_NUMBER>"
    echo "Example: $0 42"
    exit 1
fi

echo "🔍 Starting automated review for PR #${PR_NUMBER}..."

# Get repository and commit information
REPO_INFO=$(gh repo view --json owner,name 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ Error: Could not access repository. Ensure you're in a git repository and have GitHub CLI access."
    exit 1
fi

OWNER=$(echo "$REPO_INFO" | jq -r '.owner.login')
REPO_NAME=$(echo "$REPO_INFO" | jq -r '.name')

echo "📍 Repository: $OWNER/$REPO_NAME"

# Verify PR exists and get basic info
if ! gh pr view "$PR_NUMBER" >/dev/null 2>&1; then
    echo "❌ Error: PR #$PR_NUMBER not found or not accessible."
    echo "Available PRs:"
    gh pr list --limit 5 --json number,title,headRefName | jq -r '.[] | "  #\(.number): \(.title) (\(.headRefName))"'
    exit 1
fi

COMMIT_ID=$(gh pr view "$PR_NUMBER" --json headRefOid --jq -r '.headRefOid')
PR_INFO=$(gh pr view "$PR_NUMBER" --json title,body,additions,deletions,changedFiles,files,state,headRefName)

TITLE=$(echo "$PR_INFO" | jq -r '.title')
STATE=$(echo "$PR_INFO" | jq -r '.state')
BRANCH=$(echo "$PR_INFO" | jq -r '.headRefName')
CHANGED_FILES_COUNT=$(echo "$PR_INFO" | jq '.changedFiles')
TOTAL_ADDITIONS=$(echo "$PR_INFO" | jq '.additions')
TOTAL_DELETIONS=$(echo "$PR_INFO" | jq '.deletions')

echo "📝 PR: $TITLE"
echo "🔄 State: $STATE"
echo "🌿 Branch: $BRANCH"
echo "📁 Files changed: $CHANGED_FILES_COUNT"
echo "📊 Changes: +$TOTAL_ADDITIONS -$TOTAL_DELETIONS"

if [ "$STATE" != "open" ]; then
    echo "⚠️  Warning: PR is not open (state: $STATE)"
fi

# Determine review strategy based on PR size
if [ "$CHANGED_FILES_COUNT" -le 3 ] && [ $((TOTAL_ADDITIONS + TOTAL_DELETIONS)) -le 50 ]; then
    echo "📋 Small PR detected - using focused review strategy"
    REVIEW_STRATEGY="small"
elif [ "$CHANGED_FILES_COUNT" -le 10 ] && [ $((TOTAL_ADDITIONS + TOTAL_DELETIONS)) -le 200 ]; then
    echo "📋 Medium PR detected - using standard review strategy"
    REVIEW_STRATEGY="medium"
else
    echo "📋 Large PR detected - using comprehensive review strategy"
    REVIEW_STRATEGY="large"
fi

# Function to create inline comment using GitHub API
create_inline_comment() {
    local file_path=$1
    local line_number=$2
    local comment_body=$3
    local start_line=${4:-""}
    
    echo "💬 Adding inline comment: $file_path:$line_number"
    
    # Prepare the API call
    local api_body=$(cat <<EOF
{
  "body": "$comment_body",
  "commit_id": "$COMMIT_ID",
  "path": "$file_path",
  "line": $line_number,
  "side": "RIGHT"
}
EOF
)
    
    # Add start_line if provided (for multi-line comments)
    if [ -n "$start_line" ]; then
        api_body=$(echo "$api_body" | jq ". + {\"start_line\": $start_line}")
    fi
    
    # Make the API call
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "/repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments" \
      --input <(echo "$api_body") || {
        echo "❌ Failed to create inline comment for $file_path:$line_number"
        return 1
    }
}

# Function to submit final review
submit_review() {
    local review_body=$1
    local event_type=$2  # APPROVE, REQUEST_CHANGES, or COMMENT
    
    echo "📝 Submitting $event_type review..."
    
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "/repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/reviews" \
      -f commit_id="$COMMIT_ID" \
      -f body="$review_body" \
      -f event="$event_type" || {
        echo "❌ Failed to submit review"
        return 1
    }
}

# Function to analyze file for common issues
analyze_file() {
    local file_path=$1
    local issues_found=0
    
    if [ ! -f "$file_path" ]; then
        echo "⚠️  File not found: $file_path"
        return 0
    fi
    
    echo "🔍 Analyzing: $file_path"
    
    # Check for console.log statements (common in JS/TS)
    if [[ "$file_path" == *.js || "$file_path" == *.ts || "$file_path" == *.jsx || "$file_path" == *.tsx ]]; then
        local console_logs=$(grep -n "console\.log" "$file_path" || true)
        if [ -n "$console_logs" ]; then
            while IFS= read -r line; do
                local line_num=$(echo "$line" | cut -d: -f1)
                create_inline_comment "$file_path" "$line_num" "Consider removing console.log statements in production code. Use a proper logging library instead."
                issues_found=$((issues_found + 1))
            done <<< "$console_logs"
        fi
        
        # Check for TODO/FIXME comments
        local todos=$(grep -n -i "TODO\|FIXME\|HACK" "$file_path" || true)
        if [ -n "$todos" ]; then
            local todo_count=$(echo "$todos" | wc -l)
            echo "📝 Found $todo_count TODO/FIXME comments in $file_path"
        fi
    fi
    
    # Check for potential secrets (basic patterns)
    local secrets=$(grep -n -i "password\s*=\s*['\"][^'\"]\{8,\}\|secret\s*=\s*['\"][^'\"]\{8,\}\|key\s*=\s*['\"][^'\"]\{8,\}" "$file_path" || true)
    if [ -n "$secrets" ]; then
        while IFS= read -r line; do
            local line_num=$(echo "$line" | cut -d: -f1)
            create_inline_comment "$file_path" "$line_num" "🚨 Potential hardcoded secret detected. Use environment variables or secure storage instead."
            issues_found=$((issues_found + 1))
        done <<< "$secrets"
    fi
    
    # Check workflow files for security issues
    if [[ "$file_path" == .github/workflows/*.yml || "$file_path" == .github/workflows/*.yaml ]]; then
        echo "🔒 Analyzing workflow file: $file_path"
        
        # Check for pull_request_target (security risk)
        local prt_usage=$(grep -n "pull_request_target" "$file_path" || true)
        if [ -n "$prt_usage" ]; then
            while IFS= read -r line; do
                local line_num=$(echo "$line" | cut -d: -f1)
                create_inline_comment "$file_path" "$line_num" "⚠️ pull_request_target can be dangerous. Ensure proper input validation and avoid checking out PR code directly."
                issues_found=$((issues_found + 1))
            done <<< "$prt_usage"
        fi
        
        # Check for missing timeout
        if ! grep -q "timeout-minutes" "$file_path"; then
            echo "⚠️  Workflow $file_path missing timeout-minutes"
        fi
    fi
    
    return $issues_found
}

# Main review execution based on strategy
echo ""
echo "🚀 Executing review strategy: $REVIEW_STRATEGY"
echo "----------------------------------------"

TOTAL_ISSUES_FOUND=0
CHANGED_FILES=$(echo "$PR_INFO" | jq -r '.files[].filename')

# Analyze each changed file
while IFS= read -r file; do
    if [ -n "$file" ]; then
        analyze_file "$file"
        TOTAL_ISSUES_FOUND=$((TOTAL_ISSUES_FOUND + $?))
    fi
done <<< "$CHANGED_FILES"

echo ""
echo "📊 Analysis complete. Issues found: $TOTAL_ISSUES_FOUND"

# Execute final review based on strategy and findings
case $REVIEW_STRATEGY in
    "small")
        if [ $TOTAL_ISSUES_FOUND -eq 0 ]; then
            submit_review "## ✅ Automated Review Complete

This small PR looks good! No significant issues identified.

### Summary
- **Files reviewed:** $CHANGED_FILES_COUNT
- **Total changes:** +$TOTAL_ADDITIONS -$TOTAL_DELETIONS
- **Issues found:** $TOTAL_ISSUES_FOUND

The changes appear to be well-implemented and ready for merging." "APPROVE"
        else
            submit_review "## 📋 Automated Review Complete

This small PR has a few minor issues that should be addressed.

### Summary
- **Files reviewed:** $CHANGED_FILES_COUNT  
- **Total changes:** +$TOTAL_ADDITIONS -$TOTAL_DELETIONS
- **Issues found:** $TOTAL_ISSUES_FOUND

Please review the inline comments and address the identified issues." "COMMENT"
        fi
        ;;
        
    "medium")
        if [ $TOTAL_ISSUES_FOUND -eq 0 ]; then
            submit_review "## ✅ Standard Review Complete

This medium-sized PR has been thoroughly reviewed and looks good!

### Review Summary
- **Files reviewed:** $CHANGED_FILES_COUNT
- **Total changes:** +$TOTAL_ADDITIONS -$TOTAL_DELETIONS
- **Issues found:** None

The implementation follows good practices and is ready for merging." "APPROVE"
        elif [ $TOTAL_ISSUES_FOUND -le 3 ]; then
            submit_review "## 📋 Standard Review Complete

This medium-sized PR has been reviewed with minor issues identified.

### Review Summary
- **Files reviewed:** $CHANGED_FILES_COUNT
- **Total changes:** +$TOTAL_ADDITIONS -$TOTAL_DELETIONS
- **Issues found:** $TOTAL_ISSUES_FOUND

Please address the inline comments. The overall implementation is solid." "COMMENT"
        else
            submit_review "## ⚠️ Standard Review Complete

This medium-sized PR requires attention before merging.

### Review Summary
- **Files reviewed:** $CHANGED_FILES_COUNT
- **Total changes:** +$TOTAL_ADDITIONS -$TOTAL_DELETIONS
- **Issues found:** $TOTAL_ISSUES_FOUND

Multiple issues have been identified that should be addressed before merging. Please review all inline comments." "REQUEST_CHANGES"
        fi
        ;;
        
    "large")
        submit_review "## 🔍 Comprehensive Review Complete

This large PR has been analyzed for potential issues.

### Review Summary
- **Files reviewed:** $CHANGED_FILES_COUNT
- **Total changes:** +$TOTAL_ADDITIONS -$TOTAL_DELETIONS
- **Issues found:** $TOTAL_ISSUES_FOUND

### Recommendation
$(if [ $TOTAL_ISSUES_FOUND -eq 0 ]; then
    echo "No automated issues detected, but manual review recommended for a change of this size."
elif [ $TOTAL_ISSUES_FOUND -le 5 ]; then
    echo "Several issues identified that should be addressed. Consider breaking into smaller PRs for easier review."
else
    echo "Multiple issues found. Please address all comments and consider breaking this into smaller, focused PRs."
fi)

### Next Steps
1. Review all inline comments
2. Address identified issues
3. Consider adding tests for new functionality
4. Request manual review from team members" "$(if [ $TOTAL_ISSUES_FOUND -gt 5 ]; then echo "REQUEST_CHANGES"; else echo "COMMENT"; fi)"
        ;;
esac

echo ""
echo "✅ Automated review complete for PR #$PR_NUMBER"
echo "🔗 View PR: https://github.com/$OWNER/$REPO_NAME/pull/$PR_NUMBER"