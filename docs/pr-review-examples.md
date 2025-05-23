# PR Review Automation Examples

This document provides practical examples of automated PR reviews for different types and sizes of pull requests.

## Example 1: Small PR - Bug Fix (3 files, 25 changes)

### PR Details
- **Files**: `src/auth.js`, `src/utils.js`, `test/auth.test.js`
- **Changes**: +15 additions, -10 deletions
- **Type**: Bug fix
- **Branch**: `fix-login-validation`

### Command
```bash
./scripts/pr-review-templates/basic-pr-review.sh 123
```

### Expected Output
```
🔍 Starting automated review for PR #123...
📍 Repository: myorg/myapp
📝 PR: Fix login validation bug
🔄 State: open
🌿 Branch: fix-login-validation
📁 Files changed: 3
📊 Changes: +15 -10
📋 Small PR detected - using focused review strategy

🔍 Analyzing: src/auth.js
🔍 Analyzing: src/utils.js
🔍 Analyzing: test/auth.test.js

📊 Analysis complete. Issues found: 1

✅ Automated review complete for PR #123
```

### Review Comment Generated
```markdown
## ✅ Automated Review Complete

This small PR has been reviewed with minor issues identified.

### Review Summary
- **Files reviewed:** 3
- **Total changes:** +15 -10
- **Issues found:** 1

Please address the inline comments. The overall implementation is solid.
```

### Inline Comments Created
```
File: src/auth.js, Line: 42
Comment: Consider removing console.log statements in production code. Use a proper logging library instead.
```

## Example 2: Medium PR - Feature Addition (8 files, 150 changes)

### PR Details
- **Files**: Multiple API endpoints, tests, documentation
- **Changes**: +120 additions, -30 deletions
- **Type**: New feature
- **Branch**: `feature-user-preferences`

### Command
```bash
./scripts/pr-review-templates/basic-pr-review.sh 124
```

### Expected Output
```
🔍 Starting automated review for PR #124...
📍 Repository: myorg/myapp
📝 PR: Add user preferences feature
📁 Files changed: 8
📊 Changes: +120 -30
📋 Medium PR detected - using standard review strategy

🔍 Analyzing: src/api/preferences.js
💬 Adding inline comment: src/api/preferences.js:25
🔍 Analyzing: src/models/UserPreference.js
🔍 Analyzing: src/routes/preferences.js
💬 Adding inline comment: src/routes/preferences.js:15
🔍 Analyzing: test/preferences.test.js
🔍 Analyzing: docs/api/preferences.md

📊 Analysis complete. Issues found: 3
```

### Review Comments Generated

#### General Comment
```markdown
## 📋 Standard Review Complete

This medium-sized PR has been reviewed with minor issues identified.

### Review Summary
- **Files reviewed:** 8
- **Total changes:** +120 -30
- **Issues found:** 3

Please address the inline comments. The overall implementation is solid.
```

#### Inline Comments
```
File: src/api/preferences.js, Line: 25
Comment: 🚨 Potential SQL Injection Risk: Use parameterized queries to prevent SQL injection attacks.

File: src/routes/preferences.js, Line: 15
Comment: Consider adding input validation here:

```javascript
if (!input || typeof input !== 'string') {
  throw new Error('Invalid input');
}
```

File: src/models/UserPreference.js, Line: 8
Comment: Consider adding proper error handling for database operations.
```

## Example 3: Large PR - Security Review (15 files, 400 changes)

### PR Details
- **Files**: Authentication system overhaul
- **Changes**: +350 additions, -50 deletions
- **Type**: Security enhancement
- **Branch**: `security-auth-refactor`

### Command
```bash
./scripts/pr-review-templates/security-focused-review.sh 125
```

### Expected Output
```
🔐 Starting security-focused review for PR #125...
🏢 Repository: myorg/myapp
📍 Commit: abc12345...

🛡️  Starting comprehensive security scan...
==========================================
📁 Files to scan:
  - src/auth/login.js
  - src/auth/session.js
  - src/auth/crypto.js
  - src/middleware/auth.js
  - ... (11 more files)

🔍 Security scanning: src/auth/login.js
🚨 Creating security comment: src/auth/login.js:42 (CRITICAL)
🔍 Security scanning: src/auth/crypto.js
⚠️ Creating security comment: src/auth/crypto.js:15 (MEDIUM)

📊 Security scan complete!
==========================
🚨 Critical issues: 2
⚠️ High issues: 1
💛 Medium issues: 3
💙 Low issues: 1
📈 Total security issues: 7

📝 Submitting security review...
✅ Security review complete for PR #125

Summary: CRITICAL ISSUES FOUND
Action: REQUEST_CHANGES
```

### Security Review Generated
```markdown
# 🚨 Security Review: CRITICAL ISSUES FOUND

## Security Scan Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🚨 Critical | 2 | ❌ Action Required |
| ⚠️ High | 1 | ❌ Action Required |
| 💛 Medium | 3 | ⚠️ Review Recommended |
| 💙 Low | 1 | 💡 Informational |

**Total Issues Found**: 7

## Analysis Results

⚠️ **Issues Identified**: The automated scan detected potential security vulnerabilities that require attention.

### Critical Actions Required:
- 🚨 **2 Critical issues** must be fixed before merging
- ⚠️ **1 High severity issues** should be addressed
- 💛 **3 Medium issues** recommended for review
- 💙 **1 Low priority items** for consideration

### Next Steps:
1. 📋 Review all inline security comments
2. 🔧 Implement suggested security fixes
3. 🧪 Test security controls
4. 🔍 Consider additional manual security review
5. 📚 Review security documentation and best practices

## Recommendation

**❌ Do not merge** until critical and high severity issues are resolved.
```

### Critical Security Comments
```
File: src/auth/login.js, Line: 42
Comment: 🚨 **SQL Injection Risk**: This code appears to construct SQL queries using user input. Use parameterized queries or prepared statements instead.

**Severity**: CRITICAL
**Pattern**: SQL_INJECTION
**Matched**: `SELECT * FROM users WHERE email = '${userEmail}'`

### Recommended Actions:
- Use prepared statements or parameterized queries
- Validate and sanitize all user inputs
- Consider using an ORM with built-in protection

File: src/auth/crypto.js, Line: 15
Comment: ⚠️ **Weak Cryptography**: Using outdated or weak cryptographic algorithms. Use SHA-256+ for hashing and AES-256+ for encryption.

**Severity**: MEDIUM
**Pattern**: CRYPTO_WEAK
**Matched**: `crypto.createHash('md5')`

### Recommended Actions:
- Use SHA-256 or stronger hashing algorithms
- Implement proper salt generation
- Consider using bcrypt for password hashing
```

## Example 4: Comprehensive Review - Large Refactor (25 files, 800 changes)

### PR Details
- **Files**: Major architectural refactor
- **Changes**: +600 additions, -200 deletions
- **Type**: Refactoring
- **Branch**: `refactor-service-layer`

### Command
```bash
./scripts/pr-review-templates/comprehensive-review.sh 126
```

### Expected Multi-Phase Output

#### Phase 1: Security Review
```
🔐 Phase 1: Security & Critical Issues Review
=============================================
🔍 Security scanning: src/services/UserService.js
🔍 Security scanning: src/services/DataService.js
... (23 more files)

## 🚨 Phase 1: Security Review Results

**Critical security issues found: 1**

⚠️ **Action Required**: These security vulnerabilities must be addressed before proceeding with the review.

I've added inline comments for each security issue. Please address these concerns and update the PR.
```

#### Phase 2: Code Quality Review
```
📋 Phase 2: Code Quality & Performance Review
==============================================
📋 Quality analysis: src/services/UserService.js
📋 Quality analysis: src/controllers/ApiController.js
... (23 more files)

## 📋 Phase 2: Code Quality Review Results

### File Analysis Summary
- **Code files**: 18
- **Workflow files**: 2
- **Config files**: 3
- **Test files**: 2
- **Documentation files**: 0

### Issues Identified
- **Performance concerns**: 3
- **Code quality issues**: 8

⚠️ **Issues found** - Please review inline comments for specific recommendations.

✅ Proceeding to Phase 3: Final Assessment...
```

#### Phase 3: Final Assessment
```markdown
# 🎯 Comprehensive Review Summary

## PR Overview
- **Title**: Refactor service layer architecture
- **Author**: @developer123
- **Branch**: `refactor-service-layer` → `main`
- **Scope**: 25 files, 800 total changes

## Multi-Phase Review Results

| Phase | Focus Area | Issues Found | Status |
|-------|------------|--------------|--------|
| 🔐 Phase 1 | Security & Critical | 1 | ❌ Action Required |
| 📋 Phase 2 | Code Quality & Performance | 11 | ⚠️ Issues Found |
| 🎯 Phase 3 | Overall Assessment | - | ⚠️ REQUEST CHANGES |

## Detailed Findings

### Security Analysis
🚨 **1 security issues** found that require immediate attention

### Code Quality
📋 **8 code quality issues** identified for improvement

### Performance
⚡ **3 performance issues** found that may impact system efficiency

## Change Impact Assessment

### Files by Category
- **Code files** (18): Core functionality changes
- **Workflow files** (2): CI/CD pipeline changes
- **Config files** (3): Configuration modifications
- **Test files** (2): Test coverage updates

### Risk Assessment
🔴 **High Risk** - Large scope changes requiring careful review

## Recommendations

### Immediate Actions
1. 🚨 **Fix security issues** - Address all security vulnerabilities before merging
2. ⚡ **Optimize performance** - Review performance-related comments
3. 📋 **Improve code quality** - Address code quality suggestions

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

**⚠️ REQUEST CHANGES** - Multiple issues need attention

### Rationale
Multiple issues identified that could impact code quality and maintainability.
```

## Example 5: Clean PR - Documentation Update (2 files, 40 changes)

### PR Details
- **Files**: `README.md`, `docs/api.md`
- **Changes**: +35 additions, -5 deletions
- **Type**: Documentation
- **Branch**: `docs-api-improvements`

### Command & Output
```bash
./scripts/pr-review-templates/basic-pr-review.sh 127

🔍 Starting automated review for PR #127...
📍 Repository: myorg/myapp
📝 PR: Improve API documentation
📁 Files changed: 2
📊 Changes: +35 -5
📋 Small PR detected - using focused review strategy

🔍 Analyzing: README.md
🔍 Analyzing: docs/api.md

📊 Analysis complete. Issues found: 0

✅ Automated review complete for PR #127
```

### Clean Review Result
```markdown
## ✅ Automated Review Complete

This small PR looks good! No significant issues identified.

### Summary
- **Files reviewed:** 2
- **Total changes:** +35 -5
- **Issues found:** 0

The changes appear to be well-implemented and ready for merging.
```

## Example 6: Workflow File Changes (1 file, 50 changes)

### PR Details
- **Files**: `.github/workflows/ci.yml`
- **Changes**: +40 additions, -10 deletions
- **Type**: CI/CD improvement
- **Branch**: `improve-ci-pipeline`

### Security Review Output
```bash
./scripts/pr-review-templates/security-focused-review.sh 128

🔐 Starting security-focused review for PR #128...
🔍 Workflow file detected: .github/workflows/ci.yml
⚠️ Docker running as root or privileged in .github/workflows/ci.yml

📊 Security scan complete!
🚨 Critical issues: 0
⚠️ High issues: 1
💛 Medium issues: 0
💙 Low issues: 0
📈 Total security issues: 1
```

### Workflow-Specific Comments
```
File: .github/workflows/ci.yml, Line: 23
Comment: ⚠️ **Workflow Security**: Consider adding timeout to prevent infinite runs:

```yaml
timeout-minutes: 10
```

File: .github/workflows/ci.yml, Line: 45
Comment: 🚨 **Docker Security**: Running containers with elevated privileges detected. Ensure this is necessary:

```yaml
# Instead of:
run: docker run --privileged myimage

# Consider:
run: docker run --cap-add=SYS_ADMIN myimage  # Only specific capabilities
```
```

## Testing These Examples

To test these examples in your environment:

1. **Create test PRs** with different characteristics
2. **Run the scripts** on actual PRs
3. **Verify output** matches expected results
4. **Adjust thresholds** based on your project needs

### Test Commands
```bash
# Test with different PR types
./scripts/pr-review-templates/basic-pr-review.sh <small-pr-number>
./scripts/pr-review-templates/security-focused-review.sh <security-pr-number>
./scripts/pr-review-templates/comprehensive-review.sh <large-pr-number>

# Verify GitHub CLI access
gh pr list
gh auth status

# Check script permissions
ls -la scripts/pr-review-templates/
```

## Integration with Claude Webhook

These examples can be triggered through the Claude webhook system:

```
@ClaudeBot review this PR comprehensively
@ClaudeBot run security scan on this PR
@ClaudeBot perform basic review
```

The webhook system will automatically select the appropriate script based on PR characteristics or execute the requested review type.