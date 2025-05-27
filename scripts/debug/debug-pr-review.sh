#!/bin/bash

# Debug PR Review Configuration
# This script helps diagnose why automated PR reviews might not be triggering

set -e

echo "=== Claude Hub PR Review Debug Tool ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

function log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

function log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

function log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if running in container
if [ -f /.dockerenv ]; then
    log_info "Running inside Docker container"
    ENV_SOURCE="container"
else
    log_info "Running on host system"
    ENV_SOURCE="host"
fi

echo ""
echo "=== Environment Configuration Check ==="

# Check critical environment variables
critical_vars=(
    "BOT_USERNAME"
    "GITHUB_TOKEN"
    "GITHUB_WEBHOOK_SECRET"
    "ANTHROPIC_API_KEY"
)

optional_vars=(
    "PR_REVIEW_WAIT_FOR_ALL_CHECKS"
    "PR_REVIEW_TRIGGER_WORKFLOW"
    "PR_REVIEW_DEBOUNCE_MS"
    "AUTHORIZED_USERS"
)

for var in "${critical_vars[@]}"; do
    if [ -n "${!var}" ]; then
        if [[ "$var" == *"TOKEN"* ]] || [[ "$var" == *"SECRET"* ]] || [[ "$var" == *"KEY"* ]]; then
            log_success "$var is set (value hidden for security)"
        else
            log_success "$var = ${!var}"
        fi
    else
        log_error "$var is NOT set (required)"
    fi
done

echo ""
echo "=== PR Review Configuration ==="

for var in "${optional_vars[@]}"; do
    if [ -n "${!var}" ]; then
        log_info "$var = ${!var}"
    else
        log_warn "$var is not set (using default)"
    fi
done

# Show effective configuration
echo ""
echo "=== Effective PR Review Configuration ==="

WAIT_FOR_ALL_CHECKS="${PR_REVIEW_WAIT_FOR_ALL_CHECKS:-true}"
TRIGGER_WORKFLOW="${PR_REVIEW_TRIGGER_WORKFLOW:-}"
DEBOUNCE_MS="${PR_REVIEW_DEBOUNCE_MS:-5000}"

log_info "Wait for all checks: $WAIT_FOR_ALL_CHECKS"
log_info "Trigger workflow: ${TRIGGER_WORKFLOW:-'(not set - will use wait for all checks mode)'}"
log_info "Debounce delay: ${DEBOUNCE_MS}ms"

echo ""
echo "=== Docker Configuration Check ==="

# Check if Docker is available
if command -v docker &> /dev/null; then
    log_success "Docker is available"
    
    # Check if webhook service is running
    if docker compose ps webhook &> /dev/null; then
        if docker compose ps webhook | grep -q "Up"; then
            log_success "Webhook service is running"
        else
            log_warn "Webhook service exists but may not be running"
        fi
    else
        log_warn "Webhook service not found via docker compose"
    fi
    
    # Check if Claude container image exists
    if docker images | grep -q "claudecode"; then
        log_success "Claude container image found"
    else
        log_warn "Claude container image not found - may need to build"
    fi
else
    log_warn "Docker not available"
fi

echo ""
echo "=== GitHub Configuration Check ==="

# Check GitHub CLI
if command -v gh &> /dev/null; then
    log_success "GitHub CLI is available"
    
    # Check GitHub authentication
    if gh auth status &> /dev/null; then
        log_success "GitHub CLI is authenticated"
    else
        log_warn "GitHub CLI is not authenticated"
    fi
else
    log_warn "GitHub CLI not available"
fi

echo ""
echo "=== Recent Webhook Logs ==="

# Try to get recent logs
if docker compose ps webhook &> /dev/null; then
    log_info "Recent webhook logs (last 20 lines):"
    echo ""
    docker compose logs --tail=20 webhook | grep -E "(check_suite|PR review|Triggering|Not triggering)" || log_warn "No PR review related logs found"
else
    log_warn "Cannot access webhook logs - service may not be running"
fi

echo ""
echo "=== Recommendations ==="

if [ "$WAIT_FOR_ALL_CHECKS" = "true" ] && [ -z "$TRIGGER_WORKFLOW" ]; then
    log_info "Using 'wait for all checks' mode - reviews will trigger when ALL check suites complete successfully"
elif [ "$WAIT_FOR_ALL_CHECKS" = "false" ] && [ -n "$TRIGGER_WORKFLOW" ]; then
    log_info "Using 'specific workflow trigger' mode - reviews will trigger when '$TRIGGER_WORKFLOW' completes"
else
    log_warn "Configuration may be inconsistent - recommend setting either:"
    echo "  Option A: PR_REVIEW_WAIT_FOR_ALL_CHECKS=true (and leave TRIGGER_WORKFLOW empty)"
    echo "  Option B: PR_REVIEW_WAIT_FOR_ALL_CHECKS=false and set PR_REVIEW_TRIGGER_WORKFLOW"
fi

echo ""
echo "=== Test Commands ==="
echo "To test PR review functionality:"
echo ""
echo "1. Monitor webhook logs in real-time:"
echo "   docker compose logs -f webhook | grep -E '(check_suite|PR review)'"
echo ""
echo "2. Check environment variables in container:"
echo "   docker compose exec webhook env | grep PR_REVIEW"
echo ""
echo "3. Test with a real PR:"
echo "   - Create a PR with passing checks"
echo "   - Monitor logs for check_suite webhook events"
echo "   - Verify 'shouldTriggerReview' is true in logs"
echo ""
echo "4. Manual webhook test:"
echo "   node test/debug-check-suite-webhook.js"
echo ""

log_info "Debug analysis complete!"