#!/bin/bash

# GitHub Actions Runner Management Script
# Manage the webhook deployment runner service

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SERVICE_NAME="webhook-deployment-runner"
RUNNER_DIR="/home/jonflatt/github-actions-runner"
RUNNER_USER="jonflatt"

# Function to print usage
usage() {
    echo -e "${BLUE}GitHub Actions Runner Management Tool${NC}"
    echo -e "${BLUE}=====================================${NC}"
    echo -e "\nUsage: $0 [command]"
    echo -e "\nCommands:"
    echo -e "  ${GREEN}start${NC}      - Start the runner service"
    echo -e "  ${GREEN}stop${NC}       - Stop the runner service"
    echo -e "  ${GREEN}restart${NC}    - Restart the runner service"
    echo -e "  ${GREEN}status${NC}     - Check runner service status"
    echo -e "  ${GREEN}logs${NC}       - View runner logs (live)"
    echo -e "  ${GREEN}logs-tail${NC}  - View last 50 lines of logs"
    echo -e "  ${GREEN}update${NC}     - Update runner to latest version"
    echo -e "  ${GREEN}config${NC}     - Show runner configuration"
    echo -e "  ${GREEN}health${NC}     - Check runner health"
    echo -e "  ${GREEN}jobs${NC}       - Show recent job history"
    echo -e "  ${GREEN}cleanup${NC}    - Clean up work directory"
    echo -e "  ${GREEN}info${NC}       - Show runner information"
    exit 1
}

# Check if running with correct permissions
check_permissions() {
    if [[ $EUID -ne 0 ]] && [[ "$1" =~ ^(start|stop|restart|update)$ ]]; then
        echo -e "${RED}Error: This command requires sudo privileges${NC}"
        echo -e "${YELLOW}Run: sudo $0 $1${NC}"
        exit 1
    fi
}

# Start the runner
start_runner() {
    echo -e "${YELLOW}Starting runner service...${NC}"
    systemctl start $SERVICE_NAME
    sleep 2
    if systemctl is-active --quiet $SERVICE_NAME; then
        echo -e "${GREEN}✓ Runner started successfully${NC}"
        systemctl status $SERVICE_NAME --no-pager | head -n 10
    else
        echo -e "${RED}✗ Failed to start runner${NC}"
        systemctl status $SERVICE_NAME --no-pager
        exit 1
    fi
}

# Stop the runner
stop_runner() {
    echo -e "${YELLOW}Stopping runner service...${NC}"
    systemctl stop $SERVICE_NAME
    echo -e "${GREEN}✓ Runner stopped${NC}"
}

# Restart the runner
restart_runner() {
    echo -e "${YELLOW}Restarting runner service...${NC}"
    systemctl restart $SERVICE_NAME
    sleep 2
    if systemctl is-active --quiet $SERVICE_NAME; then
        echo -e "${GREEN}✓ Runner restarted successfully${NC}"
        systemctl status $SERVICE_NAME --no-pager | head -n 10
    else
        echo -e "${RED}✗ Failed to restart runner${NC}"
        systemctl status $SERVICE_NAME --no-pager
        exit 1
    fi
}

# Check runner status
check_status() {
    echo -e "${BLUE}Runner Service Status${NC}"
    echo -e "${BLUE}===================${NC}"
    systemctl status $SERVICE_NAME --no-pager
    
    echo -e "\n${BLUE}Runner Process Info${NC}"
    echo -e "${BLUE}===================${NC}"
    ps aux | grep -E "(Runner.Listener|run.sh)" | grep -v grep || echo "No runner processes found"
}

# View logs
view_logs() {
    echo -e "${YELLOW}Viewing live logs (Ctrl+C to exit)...${NC}"
    journalctl -u $SERVICE_NAME -f
}

# View last 50 lines of logs
view_logs_tail() {
    echo -e "${BLUE}Last 50 lines of runner logs${NC}"
    echo -e "${BLUE}===========================${NC}"
    journalctl -u $SERVICE_NAME -n 50 --no-pager
}

# Update runner
update_runner() {
    echo -e "${YELLOW}Updating GitHub Actions Runner...${NC}"
    
    # Stop the service
    systemctl stop $SERVICE_NAME
    
    # Get current version
    CURRENT_VERSION=$($RUNNER_DIR/bin/Runner.Listener --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' || echo "unknown")
    echo -e "Current version: ${YELLOW}$CURRENT_VERSION${NC}"
    
    # Get latest version
    LATEST_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')
    echo -e "Latest version: ${GREEN}$LATEST_VERSION${NC}"
    
    if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
        echo -e "${GREEN}✓ Runner is already up to date${NC}"
        systemctl start $SERVICE_NAME
        return
    fi
    
    # Backup current runner
    echo -e "${YELLOW}Backing up current runner...${NC}"
    cd $RUNNER_DIR
    tar -czf runner-backup-$(date +%Y%m%d-%H%M%S).tar.gz bin externals
    
    # Download and extract new version
    echo -e "${YELLOW}Downloading new version...${NC}"
    curl -o actions-runner-linux-x64.tar.gz -L "https://github.com/actions/runner/releases/download/v${LATEST_VERSION}/actions-runner-linux-x64-${LATEST_VERSION}.tar.gz"
    tar xzf ./actions-runner-linux-x64.tar.gz
    rm actions-runner-linux-x64.tar.gz
    
    # Start the service
    systemctl start $SERVICE_NAME
    echo -e "${GREEN}✓ Runner updated to version $LATEST_VERSION${NC}"
}

# Show configuration
show_config() {
    echo -e "${BLUE}Runner Configuration${NC}"
    echo -e "${BLUE}===================${NC}"
    
    if [ -f "$RUNNER_DIR/.runner" ]; then
        echo -e "\n${GREEN}Runner Settings:${NC}"
        cat "$RUNNER_DIR/.runner" | jq '.' 2>/dev/null || cat "$RUNNER_DIR/.runner"
    fi
    
    if [ -f "$RUNNER_DIR/.credentials" ]; then
        echo -e "\n${GREEN}Runner Registration:${NC}"
        echo "Runner is registered (credentials file exists)"
    else
        echo -e "\n${RED}Runner is not configured${NC}"
    fi
    
    echo -e "\n${GREEN}Service Configuration:${NC}"
    systemctl show $SERVICE_NAME | grep -E "(LoadState|ActiveState|SubState|MainPID|Environment)"
}

# Check health
check_health() {
    echo -e "${BLUE}Runner Health Check${NC}"
    echo -e "${BLUE}==================${NC}"
    
    # Check service status
    if systemctl is-active --quiet $SERVICE_NAME; then
        echo -e "${GREEN}✓ Service is running${NC}"
    else
        echo -e "${RED}✗ Service is not running${NC}"
    fi
    
    # Check disk space
    DISK_USAGE=$(df -h $RUNNER_DIR | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$DISK_USAGE" -lt 80 ]; then
        echo -e "${GREEN}✓ Disk usage: ${DISK_USAGE}%${NC}"
    else
        echo -e "${RED}✗ Disk usage: ${DISK_USAGE}% (High)${NC}"
    fi
    
    # Check work directory size
    if [ -d "$RUNNER_DIR/_work" ]; then
        WORK_SIZE=$(du -sh "$RUNNER_DIR/_work" 2>/dev/null | cut -f1)
        echo -e "${BLUE}Work directory size: $WORK_SIZE${NC}"
    fi
    
    # Check runner connectivity
    if [ -f "$RUNNER_DIR/.runner" ]; then
        GITHUB_URL=$(cat "$RUNNER_DIR/.runner" | jq -r '.gitHubUrl' 2>/dev/null || echo "")
        if [ -n "$GITHUB_URL" ] && curl -s -o /dev/null -w "%{http_code}" "$GITHUB_URL" | grep -q "200"; then
            echo -e "${GREEN}✓ GitHub connectivity OK${NC}"
        else
            echo -e "${YELLOW}⚠ Cannot verify GitHub connectivity${NC}"
        fi
    fi
}

# Show recent jobs
show_jobs() {
    echo -e "${BLUE}Recent Runner Jobs${NC}"
    echo -e "${BLUE}=================${NC}"
    
    # Check for job history in work directory
    if [ -d "$RUNNER_DIR/_work" ]; then
        echo -e "\n${GREEN}Recent job directories:${NC}"
        ls -la "$RUNNER_DIR/_work" 2>/dev/null | tail -n 10 || echo "No job directories found"
    fi
    
    # Show recent log entries
    echo -e "\n${GREEN}Recent job activity:${NC}"
    journalctl -u $SERVICE_NAME --since "1 hour ago" | grep -E "(Running job|Job .* completed|Completed request)" | tail -n 20 || echo "No recent job activity"
}

# Cleanup work directory
cleanup_work() {
    echo -e "${YELLOW}Cleaning up work directory...${NC}"
    
    if [ ! -d "$RUNNER_DIR/_work" ]; then
        echo -e "${GREEN}Work directory doesn't exist${NC}"
        return
    fi
    
    # Show current size
    BEFORE_SIZE=$(du -sh "$RUNNER_DIR/_work" 2>/dev/null | cut -f1)
    echo -e "Current size: ${YELLOW}$BEFORE_SIZE${NC}"
    
    # Confirm
    read -p "Are you sure you want to clean the work directory? (y/N): " confirm
    if [ "$confirm" != "y" ]; then
        echo -e "${YELLOW}Cleanup cancelled${NC}"
        return
    fi
    
    # Stop runner
    systemctl stop $SERVICE_NAME
    
    # Clean work directory
    rm -rf "$RUNNER_DIR/_work"/*
    
    # Start runner
    systemctl start $SERVICE_NAME
    
    echo -e "${GREEN}✓ Work directory cleaned${NC}"
}

# Show runner info
show_info() {
    echo -e "${BLUE}GitHub Actions Runner Information${NC}"
    echo -e "${BLUE}=================================${NC}"
    
    echo -e "\n${GREEN}Basic Info:${NC}"
    echo -e "Service Name: ${YELLOW}$SERVICE_NAME${NC}"
    echo -e "Runner Directory: ${YELLOW}$RUNNER_DIR${NC}"
    echo -e "Runner User: ${YELLOW}$RUNNER_USER${NC}"
    
    if [ -f "$RUNNER_DIR/bin/Runner.Listener" ]; then
        VERSION=$($RUNNER_DIR/bin/Runner.Listener --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' || echo "unknown")
        echo -e "Runner Version: ${YELLOW}$VERSION${NC}"
    fi
    
    echo -e "\n${GREEN}System Info:${NC}"
    echo -e "Hostname: ${YELLOW}$(hostname)${NC}"
    echo -e "OS: ${YELLOW}$(lsb_release -d | cut -f2)${NC}"
    echo -e "Kernel: ${YELLOW}$(uname -r)${NC}"
    echo -e "Architecture: ${YELLOW}$(uname -m)${NC}"
    
    echo -e "\n${GREEN}Docker Info:${NC}"
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,$//')
        echo -e "Docker Version: ${YELLOW}$DOCKER_VERSION${NC}"
        
        if groups $RUNNER_USER | grep -q docker; then
            echo -e "Docker Access: ${GREEN}✓ User in docker group${NC}"
        else
            echo -e "Docker Access: ${RED}✗ User not in docker group${NC}"
        fi
    else
        echo -e "${RED}Docker not installed${NC}"
    fi
    
    echo -e "\n${GREEN}Labels:${NC}"
    echo -e "${YELLOW}self-hosted,linux,x64,deployment,webhook-cd${NC}"
}

# Main logic
check_permissions "$1"

case "$1" in
    start)
        start_runner
        ;;
    stop)
        stop_runner
        ;;
    restart)
        restart_runner
        ;;
    status)
        check_status
        ;;
    logs)
        view_logs
        ;;
    logs-tail)
        view_logs_tail
        ;;
    update)
        update_runner
        ;;
    config)
        show_config
        ;;
    health)
        check_health
        ;;
    jobs)
        show_jobs
        ;;
    cleanup)
        cleanup_work
        ;;
    info)
        show_info
        ;;
    *)
        usage
        ;;
esac