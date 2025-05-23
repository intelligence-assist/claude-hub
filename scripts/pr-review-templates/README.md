# PR Review Script Templates

This directory contains automated PR review script templates that can be used directly or integrated with the Claude webhook system.

## Available Scripts

### 1. Basic PR Review (`basic-pr-review.sh`)

**Purpose**: General-purpose PR review with adaptive strategy based on PR size.

**Features**:
- Automatic PR size detection (small/medium/large)
- Basic security pattern detection
- Code quality checks
- Workflow file analysis
- Adaptive review strategy

**Usage**:
```bash
./basic-pr-review.sh <PR_NUMBER>
```

**Example**:
```bash
./basic-pr-review.sh 42
```

### 2. Security-Focused Review (`security-focused-review.sh`)

**Purpose**: Comprehensive security analysis with severity-based assessment.

**Features**:
- Advanced security pattern detection
- Severity classification (Critical/High/Medium/Low)
- Security-specific recommendations
- Detailed vulnerability descriptions
- Automated security scoring

**Usage**:
```bash
./security-focused-review.sh <PR_NUMBER>
```

**Security Patterns Detected**:
- SQL Injection
- Cross-Site Scripting (XSS)
- Hardcoded Secrets
- Path Traversal
- Command Injection
- Unsafe Deserialization
- Weak Cryptography
- Insecure Random Number Generation

### 3. Comprehensive Review (`comprehensive-review.sh`)

**Purpose**: Multi-phase review for large, complex PRs.

**Features**:
- Three-phase review process
- File categorization and analysis
- Risk assessment
- Detailed recommendations
- Comprehensive final assessment

**Phases**:
1. **Security & Critical Issues** - Must-fix security vulnerabilities
2. **Code Quality & Performance** - Improvement recommendations
3. **Final Assessment** - Overall recommendation and summary

**Usage**:
```bash
./comprehensive-review.sh <PR_NUMBER>
```

## Prerequisites

### Required Tools
- **GitHub CLI** (`gh`) - Must be authenticated
- **jq** - JSON processing
- **grep** - Pattern matching
- **bash** - Shell execution

### Authentication Setup
```bash
# Authenticate with GitHub CLI
gh auth login

# Verify authentication
gh auth status
```

### Repository Access
Scripts must be run from within a Git repository with GitHub remote access.

## Integration with Claude Webhook

These scripts can be integrated with the existing Claude webhook system in several ways:

### Method 1: Direct Integration
Add the script execution to the automated PR review workflow in `src/controllers/githubController.js`:

```javascript
// In the check_suite completion handler
const prReviewPrompt = `Execute the comprehensive PR review script:

\`\`\`bash
cd /workspace/repo
./scripts/pr-review-templates/comprehensive-review.sh ${pr.number}
\`\`\`

This will perform automated analysis and provide detailed feedback.`;
```

### Method 2: Command-Based Trigger
Users can trigger specific review types via GitHub comments:

```
@ClaudeBot run security review
@ClaudeBot run comprehensive review  
@ClaudeBot run basic review
```

### Method 3: Conditional Selection
Automatically select script based on PR characteristics:

```javascript
const prSize = pr.additions + pr.deletions;
const changedFiles = pr.changed_files;

let reviewScript;
if (changedFiles <= 3 && prSize <= 50) {
    reviewScript = 'basic-pr-review.sh';
} else if (changedFiles <= 15 && prSize <= 500) {
    reviewScript = 'security-focused-review.sh';
} else {
    reviewScript = 'comprehensive-review.sh';
}
```

## Customization

### Adding New Security Patterns
Edit the `SECURITY_PATTERNS` associative array in the security script:

```bash
declare -A SECURITY_PATTERNS=(
    ["CUSTOM_PATTERN"]="your-regex-pattern-here"
    # ... existing patterns
)
```

### Modifying Review Criteria
Adjust thresholds in the scripts:

```bash
# Change PR size thresholds
if [ "$CHANGED_FILES_COUNT" -le 5 ] && [ $((TOTAL_ADDITIONS + TOTAL_DELETIONS)) -le 100 ]; then
    REVIEW_STRATEGY="small"
# ... etc
```

### Custom Issue Analysis
Add new analysis functions:

```bash
analyze_custom_quality() {
    local file=$1
    local issues=0
    
    # Your custom analysis logic here
    
    echo $issues
}
```

## Output Examples

### Basic Review Output
```
🔍 Starting automated review for PR #42...
📍 Repository: owner/repo
📝 PR: Fix authentication bug
🔄 State: open
🌿 Branch: fix-auth-bug
📁 Files changed: 3
📊 Changes: +25 -10
📋 Small PR detected - using focused review strategy
✅ Automated review complete for PR #42
```

### Security Review Output
```
🔐 Starting security-focused review for PR #42...
🚨 Critical issues: 2
⚠️ High issues: 1
💛 Medium issues: 0
💙 Low issues: 0
📈 Total security issues: 3
❌ Do not merge until critical and high severity issues are resolved.
```

### Comprehensive Review Output
```
🎯 Starting comprehensive multi-phase review for PR #42...
🔐 Phase 1: Security & Critical Issues Review
📋 Phase 2: Code Quality & Performance Review
🎯 Phase 3: Final Assessment & Recommendations
✅ Comprehensive review complete for PR #42
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```bash
   chmod +x scripts/pr-review-templates/*.sh
   ```

2. **GitHub CLI Not Authenticated**
   ```bash
   gh auth login
   ```

3. **jq Command Not Found**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install jq
   
   # macOS
   brew install jq
   ```

4. **PR Not Found**
   - Verify PR number exists
   - Check repository access permissions
   - Ensure you're in the correct repository

### Debug Mode
Enable debug output by adding to the beginning of scripts:
```bash
set -x  # Enable debug mode
```

### Manual Testing
Test individual components:
```bash
# Test GitHub CLI access
gh pr list

# Test PR access
gh pr view 42

# Test API access
gh api user
```

## Best Practices

### Security Considerations
- Never commit GitHub tokens or secrets
- Use environment variables for sensitive data
- Regularly update security patterns
- Review script permissions

### Performance Tips
- Use GitHub CLI caching when possible
- Batch API calls for efficiency
- Limit file analysis for very large PRs
- Consider async processing for complex reviews

### Maintenance
- Regularly update security patterns
- Test scripts with different PR types
- Monitor GitHub API rate limits
- Keep documentation current

## Contributing

To add new review templates:

1. Create new script in this directory
2. Follow naming convention: `{purpose}-review.sh`
3. Make executable: `chmod +x {script-name}.sh`
4. Add documentation to this README
5. Test with various PR types
6. Submit PR with examples

## Support

For issues with these scripts:
1. Check the troubleshooting section
2. Verify all prerequisites are met
3. Test with a simple PR first
4. Report issues with specific error messages