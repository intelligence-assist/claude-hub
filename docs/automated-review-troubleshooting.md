# Automated PR Review Troubleshooting Guide

This guide helps diagnose and fix issues with automated PR reviews not being triggered.

## Overview

The automated PR review system triggers when GitHub check suites complete successfully. There are several configuration options to control when reviews are triggered.

## Environment Variables

### Core Configuration

- **`PR_REVIEW_WAIT_FOR_ALL_CHECKS`** (default: `true`)
  - `true`: Waits for ALL check suites to complete successfully before triggering review
  - `false`: Uses specific workflow trigger (requires `PR_REVIEW_TRIGGER_WORKFLOW`)

- **`PR_REVIEW_TRIGGER_WORKFLOW`** (default: empty)
  - Name of specific workflow that should trigger reviews
  - Only used when `PR_REVIEW_WAIT_FOR_ALL_CHECKS` is `false`
  - Example: `"Pull Request CI"`

- **`PR_REVIEW_DEBOUNCE_MS`** (default: `5000`)
  - Delay in milliseconds before checking all check suites status
  - Accounts for GitHub's eventual consistency

### Debug/Testing Options

- **`PR_REVIEW_FORCE_ON_SUCCESS`** (default: `false`)
  - `true`: Forces review trigger on any successful check suite (ignores other conditions)
  - Useful for testing and debugging
  - **⚠️ Use with caution in production**

## How It Works

### Trigger Flow

1. **GitHub Webhook**: `check_suite` event with `action: 'completed'` and `conclusion: 'success'`
2. **Validation**: Check if PR is associated with the check suite
3. **Review Logic**: Determine if review should be triggered based on configuration
4. **Execution**: Run comprehensive PR review via Claude
5. **Labeling**: Update PR labels to track review status

### Review Decision Logic

```javascript
if (waitForAllChecks || !triggerWorkflowName) {
  // Check if ALL check suites for the PR are successful
  shouldTriggerReview = await checkAllCheckSuitesComplete(pullRequests);
} else {
  // Check if this specific workflow matches the trigger
  shouldTriggerReview = (workflowName === triggerWorkflowName);
}

// Force review mode (debugging)
if (PR_REVIEW_FORCE_ON_SUCCESS === 'true') {
  shouldTriggerReview = true;
}
```

## Common Issues & Solutions

### 1. Reviews Never Trigger

**Symptoms**: No automated reviews on any PRs

**Possible Causes**:
- All checks required but some checks are failing/missing
- Workflow name mismatch when using specific trigger
- Environment variables not set correctly

**Debug Steps**:
```bash
# Check environment variables
docker compose exec webhook env | grep PR_REVIEW

# Check webhook logs
docker compose logs webhook | grep "check_suite"

# Run debug script
node test/debug-automated-review.js <PR_NUMBER>
```

**Solutions**:
- Enable force review mode temporarily: `PR_REVIEW_FORCE_ON_SUCCESS=true`
- Switch to specific workflow trigger instead of waiting for all checks
- Check if required status checks are configured in GitHub repo settings

### 2. Reviews Trigger Multiple Times

**Symptoms**: Multiple reviews for the same commit

**Possible Causes**:
- Multiple check suites completing at different times
- Duplicate prevention not working

**Solutions**:
- System includes commit SHA checking to prevent duplicates
- Check logs for "Already reviewed at this commit" messages

### 3. Reviews Only Work for Some PRs

**Symptoms**: Reviews work for main repo PRs but not forks

**Possible Causes**:
- Fork PRs don't include `pull_requests` array in check_suite webhook
- Different security context for fork PRs

**Solutions**:
- Fork PR support is limited by GitHub webhook payload structure
- Consider using `pull_request` events instead of `check_suite` for fork PRs

### 4. Wrong Workflow Triggering Reviews

**Symptoms**: Reviews triggered by unexpected workflows

**Possible Causes**:
- `PR_REVIEW_TRIGGER_WORKFLOW` not set or incorrectly named
- Multiple workflows with similar names

**Debug Steps**:
```bash
# List available workflows
gh workflow list --repo owner/repo

# Check specific workflow name in logs
docker compose logs webhook | grep "workflow"
```

**Solutions**:
- Set exact workflow name: `PR_REVIEW_TRIGGER_WORKFLOW="Pull Request CI"`
- Use `waitForAllChecks=false` to require specific workflow

## Testing & Debugging

### Debug Script

```bash
# Test specific PR
node test/debug-automated-review.js 93

# Check environment
PR_REVIEW_WAIT_FOR_ALL_CHECKS=false \
PR_REVIEW_TRIGGER_WORKFLOW="Pull Request CI" \
node test/debug-automated-review.js 93
```

### Force Review Mode

For testing, you can force reviews to trigger:

```bash
# Enable force mode
export PR_REVIEW_FORCE_ON_SUCCESS=true

# Restart service
docker compose restart webhook
```

**⚠️ Remember to disable force mode in production**

### Manual Review Trigger

You can manually trigger a review by mentioning the bot in a PR comment:

```
@MCPClaude please review this PR
```

## Configuration Examples

### Wait for All Checks (Default)
```bash
PR_REVIEW_WAIT_FOR_ALL_CHECKS=true
PR_REVIEW_TRIGGER_WORKFLOW=
```

### Specific Workflow Trigger
```bash
PR_REVIEW_WAIT_FOR_ALL_CHECKS=false
PR_REVIEW_TRIGGER_WORKFLOW="Pull Request CI"
```

### Debug Mode
```bash
PR_REVIEW_WAIT_FOR_ALL_CHECKS=true
PR_REVIEW_FORCE_ON_SUCCESS=true
PR_REVIEW_DEBOUNCE_MS=1000
```

## Monitoring

### Important Log Messages

- `"Triggering automated PR review"` - Review is starting
- `"Not triggering PR review"` - Review was skipped (check `triggerReason`)
- `"Already reviewed at this commit"` - Duplicate prevention
- `"DEBUG: PR check suites analysis"` - Detailed check suite information

### Webhook Response Codes

- `200` - Success (review triggered or skipped)
- `401` - Webhook signature verification failed
- `500` - Internal error during processing

## Security Considerations

- Force review mode bypasses normal safety checks
- Automated reviews run with full Claude Code permissions
- Reviews are labeled to track status and prevent duplicates
- All reviews include commit SHA for traceability