#!/bin/bash

# Comprehensive PR Review Script
# Usage: ./comprehensive-review.sh <PR_NUMBER>
# This script performs multi-phase review for large PRs

set -e

PR_NUMBER=$1
if [ -z "$PR_NUMBER" ]; then
    echo "Usage: $0 <PR_NUMBER>"
    echo "Example: $0 42"
    exit 1
fi

echo "🎯 Starting comprehensive multi-phase review for PR #${PR_NUMBER}..."

# Get repository information
REPO_INFO=$(gh repo view --json owner,name 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ Error: Could not access repository"
    exit 1
fi

OWNER=$(echo "$REPO_INFO" | jq -r '.owner.login')
REPO_NAME=$(echo "$REPO_INFO" | jq -r '.name')
COMMIT_ID=$(gh pr view "$PR_NUMBER" --json headRefOid --jq -r '.headRefOid')

# Get comprehensive PR information
PR_INFO=$(gh pr view "$PR_NUMBER" --json title,body,additions,deletions,changedFiles,files,state,headRefName,baseRefName,author)

TITLE=$(echo "$PR_INFO" | jq -r '.title')
AUTHOR=$(echo "$PR_INFO" | jq -r '.author.login')
STATE=$(echo "$PR_INFO" | jq -r '.state')
HEAD_BRANCH=$(echo "$PR_INFO" | jq -r '.headRefName')
BASE_BRANCH=$(echo "$PR_INFO" | jq -r '.baseRefName')
CHANGED_FILES_COUNT=$(echo "$PR_INFO" | jq '.changedFiles')
TOTAL_ADDITIONS=$(echo "$PR_INFO" | jq '.additions')
TOTAL_DELETIONS=$(echo "$PR_INFO" | jq '.deletions')
TOTAL_CHANGES=$((TOTAL_ADDITIONS + TOTAL_DELETIONS))

echo "📊 PR Analysis:"
echo "  Title: $TITLE"
echo "  Author: $AUTHOR"
echo "  Branch: $HEAD_BRANCH → $BASE_BRANCH"
echo "  Files: $CHANGED_FILES_COUNT"
echo "  Changes: +$TOTAL_ADDITIONS -$TOTAL_DELETIONS (total: $TOTAL_CHANGES)"

# Initialize counters for different issue types
SECURITY_ISSUES=0
PERFORMANCE_ISSUES=0
LOGIC_ISSUES=0
STYLE_ISSUES=0
DOCUMENTATION_ISSUES=0
TEST_ISSUES=0

# File categorization
declare -a WORKFLOW_FILES=()
declare -a CODE_FILES=()
declare -a CONFIG_FILES=()
declare -a TEST_FILES=()
declare -a DOC_FILES=()

# Functions for different review phases

# Phase 1: Security and Critical Issues Review
security_review_phase() {
    echo ""
    echo "🔐 Phase 1: Security & Critical Issues Review"
    echo "============================================="
    
    local critical_issues=0
    
    # Security patterns (enhanced from security-focused script)
    declare -A SECURITY_PATTERNS=(
        ["SQL_INJECTION"]="(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*[\$\`]|query.*[\+\&].*request"
        ["XSS_VULNERABLE"]="innerHTML|document\.write|eval\(|new Function|dangerouslySetInnerHTML"
        ["HARDCODED_SECRETS"]="(password|secret|key|token|api_key|private_key)\s*[:=]\s*['\"][^'\"]{8,}['\"]"
        ["UNSAFE_FILE_OPS"]="\.\.\/|\.\.\\\\|\/etc\/|\/var\/|\/tmp\/|path\.join.*\.\."
        ["COMMAND_INJECTION"]="exec\(|system\(|shell_exec|passthru|proc_open"
        ["UNSAFE_DESERIALIZATION"]="pickle\.loads|json\.loads.*request|unserialize|yaml\.load[^_]"
    )
    
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            echo "🔍 Security scanning: $file"
            
            for pattern_name in "${!SECURITY_PATTERNS[@]}"; do
                local pattern="${SECURITY_PATTERNS[$pattern_name]}"
                local matches=$(grep -n -i -E "$pattern" "$file" 2>/dev/null || true)
                
                if [ -n "$matches" ]; then
                    while IFS= read -r line; do
                        local line_num=$(echo "$line" | cut -d: -f1)
                        local content=$(echo "$line" | cut -d: -f2-)
                        
                        create_security_comment "$file" "$line_num" "$pattern_name" "$content"
                        critical_issues=$((critical_issues + 1))
                        
                    done <<< "$matches"
                fi
            done
        fi
    done <<< "$(echo "$PR_INFO" | jq -r '.files[].filename')"
    
    SECURITY_ISSUES=$critical_issues
    
    if [ $critical_issues -gt 0 ]; then
        gh pr comment "$PR_NUMBER" --body "## 🚨 Phase 1: Security Review Results

**Critical security issues found: $critical_issues**

⚠️ **Action Required**: These security vulnerabilities must be addressed before proceeding with the review.

I've added inline comments for each security issue. Please address these concerns and update the PR."
    else
        gh pr comment "$PR_NUMBER" --body "## ✅ Phase 1: Security Review Results

**No critical security issues detected** in the automated scan.

✅ Proceeding to Phase 2: Code Quality Review..."
    fi
    
    return $critical_issues
}

# Phase 2: Code Quality and Performance Review
code_quality_review_phase() {
    echo ""
    echo "📋 Phase 2: Code Quality & Performance Review"
    echo "=============================================="
    
    local quality_issues=0
    local perf_issues=0
    
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            echo "📋 Quality analysis: $file"
            
            # Categorize files
            case "$file" in
                *.js|*.ts|*.jsx|*.tsx|*.py|*.java|*.cpp|*.c|*.cs|*.php|*.rb|*.go|*.rs)
                    CODE_FILES+=("$file")
                    quality_issues=$((quality_issues + $(analyze_code_quality "$file")))
                    perf_issues=$((perf_issues + $(analyze_performance "$file")))
                    ;;
                *.github/workflows/*|*.yml|*.yaml)
                    WORKFLOW_FILES+=("$file")
                    quality_issues=$((quality_issues + $(analyze_workflow_quality "$file")))
                    ;;
                *.json|*.toml|*.ini|*.conf|*.config)
                    CONFIG_FILES+=("$file")
                    quality_issues=$((quality_issues + $(analyze_config_quality "$file")))
                    ;;
                *test*|*spec*|*.test.*|*.spec.*)
                    TEST_FILES+=("$file")
                    quality_issues=$((quality_issues + $(analyze_test_quality "$file")))
                    ;;
                *.md|*.rst|*.txt|README*|CHANGELOG*|LICENSE*)
                    DOC_FILES+=("$file")
                    quality_issues=$((quality_issues + $(analyze_documentation_quality "$file")))
                    ;;
            esac
        fi
    done <<< "$(echo "$PR_INFO" | jq -r '.files[].filename')"
    
    PERFORMANCE_ISSUES=$perf_issues
    LOGIC_ISSUES=$quality_issues
    
    # Create quality summary comment
    gh pr comment "$PR_NUMBER" --body "## 📋 Phase 2: Code Quality Review Results

### File Analysis Summary
- **Code files**: ${#CODE_FILES[@]}
- **Workflow files**: ${#WORKFLOW_FILES[@]}
- **Config files**: ${#CONFIG_FILES[@]}
- **Test files**: ${#TEST_FILES[@]}
- **Documentation files**: ${#DOC_FILES[@]}

### Issues Identified
- **Performance concerns**: $perf_issues
- **Code quality issues**: $quality_issues

$(if [ $((perf_issues + quality_issues)) -eq 0 ]; then
    echo "✅ **Good code quality** - No major issues identified in automated analysis."
else
    echo "⚠️ **Issues found** - Please review inline comments for specific recommendations."
fi)

✅ Proceeding to Phase 3: Final Assessment..."
    
    return $((perf_issues + quality_issues))
}

# Phase 3: Overall Assessment and Recommendations
final_assessment_phase() {
    echo ""
    echo "🎯 Phase 3: Final Assessment & Recommendations"
    echo "==============================================="
    
    local total_issues=$((SECURITY_ISSUES + PERFORMANCE_ISSUES + LOGIC_ISSUES + STYLE_ISSUES + TEST_ISSUES))
    
    # Determine overall recommendation
    local recommendation=""
    local review_event=""
    
    if [ $SECURITY_ISSUES -gt 0 ]; then
        recommendation="**❌ REQUEST CHANGES** - Security issues must be resolved"
        review_event="REQUEST_CHANGES"
    elif [ $total_issues -gt 10 ]; then
        recommendation="**⚠️ REQUEST CHANGES** - Multiple issues need attention"
        review_event="REQUEST_CHANGES"
    elif [ $total_issues -gt 5 ]; then
        recommendation="**💛 COMMENT** - Several improvements recommended"
        review_event="COMMENT"
    else
        recommendation="**✅ APPROVE** - Good implementation with minor suggestions"
        review_event="APPROVE"
    fi
    
    # Create comprehensive final review
    local final_review_body="# 🎯 Comprehensive Review Summary

## PR Overview
- **Title**: $TITLE
- **Author**: @$AUTHOR  
- **Branch**: \`$HEAD_BRANCH\` → \`$BASE_BRANCH\`
- **Scope**: $CHANGED_FILES_COUNT files, $TOTAL_CHANGES total changes

## Multi-Phase Review Results

| Phase | Focus Area | Issues Found | Status |
|-------|------------|--------------|--------|
| 🔐 Phase 1 | Security & Critical | $SECURITY_ISSUES | $([ $SECURITY_ISSUES -eq 0 ] && echo "✅ Clean" || echo "❌ Action Required") |
| 📋 Phase 2 | Code Quality & Performance | $((PERFORMANCE_ISSUES + LOGIC_ISSUES)) | $([ $((PERFORMANCE_ISSUES + LOGIC_ISSUES)) -eq 0 ] && echo "✅ Clean" || echo "⚠️ Issues Found") |
| 🎯 Phase 3 | Overall Assessment | - | $(echo "$recommendation" | cut -d' ' -f1-2) |

## Detailed Findings

### Security Analysis
$(if [ $SECURITY_ISSUES -eq 0 ]; then
    echo "✅ **No security vulnerabilities** detected in automated scan"
else
    echo "🚨 **$SECURITY_ISSUES security issues** found that require immediate attention"
fi)

### Code Quality
$(if [ $LOGIC_ISSUES -eq 0 ]; then
    echo "✅ **Good code quality** maintained throughout the PR"
else
    echo "📋 **$LOGIC_ISSUES code quality issues** identified for improvement"
fi)

### Performance
$(if [ $PERFORMANCE_ISSUES -eq 0 ]; then
    echo "✅ **No performance concerns** identified"
else
    echo "⚡ **$PERFORMANCE_ISSUES performance issues** found that may impact system efficiency"
fi)

## Change Impact Assessment

### Files by Category
$([ ${#CODE_FILES[@]} -gt 0 ] && echo "- **Code files** (${#CODE_FILES[@]}): Core functionality changes")
$([ ${#WORKFLOW_FILES[@]} -gt 0 ] && echo "- **Workflow files** (${#WORKFLOW_FILES[@]}): CI/CD pipeline changes")
$([ ${#CONFIG_FILES[@]} -gt 0 ] && echo "- **Config files** (${#CONFIG_FILES[@]}): Configuration modifications")
$([ ${#TEST_FILES[@]} -gt 0 ] && echo "- **Test files** (${#TEST_FILES[@]}): Test coverage updates")
$([ ${#DOC_FILES[@]} -gt 0 ] && echo "- **Documentation** (${#DOC_FILES[@]}): Documentation improvements")

### Risk Assessment
$(if [ $CHANGED_FILES_COUNT -le 5 ] && [ $TOTAL_CHANGES -le 100 ]; then
    echo "🟢 **Low Risk** - Small, focused changes"
elif [ $CHANGED_FILES_COUNT -le 15 ] && [ $TOTAL_CHANGES -le 500 ]; then
    echo "🟡 **Medium Risk** - Moderate scope changes"
else
    echo "🔴 **High Risk** - Large scope changes requiring careful review"
fi)

## Recommendations

### Immediate Actions
$(if [ $SECURITY_ISSUES -gt 0 ]; then
    echo "1. 🚨 **Fix security issues** - Address all security vulnerabilities before merging"
fi)
$(if [ $PERFORMANCE_ISSUES -gt 0 ]; then
    echo "2. ⚡ **Optimize performance** - Review performance-related comments"
fi)
$(if [ $LOGIC_ISSUES -gt 0 ]; then
    echo "3. 📋 **Improve code quality** - Address code quality suggestions"
fi)

### Before Merging
- 🧪 **Run comprehensive tests** to ensure functionality
- 🔍 **Manual review** recommended for complex changes
- 📚 **Update documentation** if new features are introduced
- 🏷️ **Consider release notes** if this affects users

### Post-Merge
- 📊 **Monitor performance** after deployment
- 🛡️ **Security validation** in staging environment
- 📈 **Track metrics** related to changes

## Final Recommendation

$recommendation

### Rationale
$(if [ $SECURITY_ISSUES -gt 0 ]; then
    echo "Security vulnerabilities must be resolved before merging to maintain system security."
elif [ $total_issues -gt 10 ]; then
    echo "Multiple issues identified that could impact code quality and maintainability."
elif [ $total_issues -gt 5 ]; then
    echo "Several improvements would enhance code quality but don't block merging."
else
    echo "Well-implemented changes with good code quality. Ready for merging after minor suggestions."
fi)

---
🤖 *Comprehensive review completed by Claude Code automated analysis. Total review time: automated. For complex changes, consider additional manual review.*"
    
    # Submit final comprehensive review
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "/repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/reviews" \
      -f commit_id="$COMMIT_ID" \
      -f body="$final_review_body" \
      -f event="$review_event" || {
        echo "❌ Failed to submit comprehensive review"
        return 1
    }
    
    return 0
}

# Helper functions for specific analysis types

create_security_comment() {
    local file_path=$1
    local line_number=$2
    local pattern_name=$3
    local matched_content=$4
    
    local description=""
    case $pattern_name in
        "SQL_INJECTION")
            description="🚨 **SQL Injection Risk**: Use parameterized queries to prevent SQL injection attacks."
            ;;
        "XSS_VULNERABLE")
            description="🚨 **XSS Vulnerability**: Sanitize user input and avoid direct DOM manipulation."
            ;;
        "HARDCODED_SECRETS")
            description="🚨 **Hardcoded Secret**: Move secrets to environment variables or secure storage."
            ;;
        "UNSAFE_FILE_OPS")
            description="🚨 **Path Traversal Risk**: Validate file paths to prevent directory traversal."
            ;;
        "COMMAND_INJECTION")
            description="🚨 **Command Injection**: Validate and sanitize input before executing system commands."
            ;;
        "UNSAFE_DESERIALIZATION")
            description="🚨 **Unsafe Deserialization**: Validate input before deserializing untrusted data."
            ;;
    esac
    
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "/repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments" \
      -f body="$description" \
      -f commit_id="$COMMIT_ID" \
      -f path="$file_path" \
      -F line="$line_number" \
      -f side="RIGHT" >/dev/null 2>&1
}

analyze_code_quality() {
    local file=$1
    local issues=0
    
    # Check for code quality issues
    if [[ "$file" == *.js || "$file" == *.ts ]]; then
        # Check for console.log statements
        if grep -q "console\.log" "$file"; then
            issues=$((issues + 1))
        fi
        
        # Check for TODO/FIXME comments
        if grep -q -i "TODO\|FIXME" "$file"; then
            issues=$((issues + 1))
        fi
        
        # Check for proper error handling
        local try_blocks=$(grep -c "try {" "$file" 2>/dev/null || echo "0")
        local catch_blocks=$(grep -c "catch" "$file" 2>/dev/null || echo "0")
        if [ "$try_blocks" -ne "$catch_blocks" ]; then
            issues=$((issues + 1))
        fi
    fi
    
    echo $issues
}

analyze_performance() {
    local file=$1
    local issues=0
    
    # Check for potential performance issues
    if [[ "$file" == *.js || "$file" == *.ts ]]; then
        # Check for synchronous operations that could block
        if grep -q "\.sync\|fs\.readFileSync\|fs\.writeFileSync" "$file"; then
            issues=$((issues + 1))
        fi
        
        # Check for inefficient loops
        if grep -q "for.*in.*length\|while.*length" "$file"; then
            issues=$((issues + 1))
        fi
    fi
    
    echo $issues
}

analyze_workflow_quality() {
    local file=$1
    local issues=0
    
    # Check workflow file quality
    if ! grep -q "timeout-minutes" "$file"; then
        issues=$((issues + 1))
    fi
    
    if grep -q "pull_request_target" "$file"; then
        issues=$((issues + 1))
    fi
    
    echo $issues
}

analyze_config_quality() {
    local file=$1
    local issues=0
    
    # Check for potential secrets in config
    if grep -q -i "password\|secret\|key" "$file"; then
        issues=$((issues + 1))
    fi
    
    echo $issues
}

analyze_test_quality() {
    local file=$1
    local issues=0
    
    # Basic test quality checks
    if [[ "$file" == *test* ]] && ! grep -q "expect\|assert\|should" "$file"; then
        issues=$((issues + 1))
    fi
    
    echo $issues
}

analyze_documentation_quality() {
    local file=$1
    local issues=0
    
    # Basic documentation checks
    if [[ "$file" == *.md ]] && [ "$(wc -l < "$file")" -lt 10 ]; then
        issues=$((issues + 1))
    fi
    
    echo $issues
}

# Main execution
echo ""
echo "🚀 Starting comprehensive multi-phase review process..."
echo "======================================================"

# Execute Phase 1: Security Review
if ! security_review_phase; then
    echo "🚨 Critical security issues found. Stopping review process."
    echo "Please address security concerns before continuing."
    exit 1
fi

# If security issues found, stop here
if [ $SECURITY_ISSUES -gt 0 ]; then
    echo "🚨 Review paused due to security issues. Please fix and re-run."
    exit 1
fi

# Execute Phase 2: Code Quality Review
code_quality_review_phase

# Execute Phase 3: Final Assessment
final_assessment_phase

echo ""
echo "✅ Comprehensive review complete for PR #$PR_NUMBER"
echo "🔗 View PR: https://github.com/$OWNER/$REPO_NAME/pull/$PR_NUMBER"
echo ""
echo "📊 Final Summary:"
echo "  Security Issues: $SECURITY_ISSUES"
echo "  Performance Issues: $PERFORMANCE_ISSUES" 
echo "  Code Quality Issues: $LOGIC_ISSUES"
echo "  Total Issues: $((SECURITY_ISSUES + PERFORMANCE_ISSUES + LOGIC_ISSUES))"