#!/bin/bash

# Claude Webhook Production Deployment Script
# Deploys the production environment on port 8082

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
COMPOSE_FILE="docker-compose.yml"
SERVICE_NAME="webhook"
HEALTH_CHECK_URL="http://localhost:8082/health"
MAX_HEALTH_RETRIES=30
PRODUCTION_BOT="MCPClaude"
BACKUP_DIR="/home/jonflatt/backups/webhook"

echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}                   Claude Webhook - PRODUCTION Deployment${NC}"
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Bot: ${GREEN}@${PRODUCTION_BOT}${NC}"
echo -e "Port: ${GREEN}8082${NC}"
echo -e "Time: ${GREEN}$(date)${NC}"
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Function to check if service is healthy
check_health() {
    local retries=0
    echo -e "${YELLOW}Checking service health...${NC}"
    
    while [ $retries -lt $MAX_HEALTH_RETRIES ]; do
        if curl -f -s "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Service is healthy!${NC}"
            return 0
        fi
        retries=$((retries + 1))
        echo -e "  Waiting for service to start... ($retries/$MAX_HEALTH_RETRIES)"
        sleep 2
    done
    
    echo -e "${RED}✗ Health check failed after $MAX_HEALTH_RETRIES attempts${NC}"
    return 1
}

# Function to create backup
create_backup() {
    echo -e "${YELLOW}Creating pre-deployment backup...${NC}"
    mkdir -p "$BACKUP_DIR"
    
    # Get current container info
    CONTAINER_ID=$(docker-compose -f "$COMPOSE_FILE" ps -q 2>/dev/null || echo "")
    if [ -n "$CONTAINER_ID" ]; then
        BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).tar.gz"
        
        # Export container
        docker export "$CONTAINER_ID" | gzip > "$BACKUP_FILE"
        echo -e "${GREEN}✓ Backup created: $BACKUP_FILE${NC}"
        
        # Keep only last 5 backups
        ls -t "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
    else
        echo -e "${YELLOW}No running container to backup${NC}"
    fi
}

# Step 1: Production safety confirmation
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}⚠️  PRODUCTION DEPLOYMENT CONFIRMATION ⚠️${NC}"
echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}You are about to deploy to PRODUCTION.${NC}"
echo -e "${YELLOW}This will affect the live @${PRODUCTION_BOT} bot.${NC}"
echo -e ""
read -p "Type 'DEPLOY PRODUCTION' to continue: " confirmation

if [ "$confirmation" != "DEPLOY PRODUCTION" ]; then
    echo -e "${RED}Deployment cancelled.${NC}"
    exit 1
fi

# Step 2: Pre-deployment checks
echo -e "\n${YELLOW}[1/8] Running pre-deployment checks...${NC}"

# Check if docker-compose file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Error: $COMPOSE_FILE not found${NC}"
    echo -e "${YELLOW}Please ensure you're running from the project root directory${NC}"
    exit 1
fi

# Check Docker daemon
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker daemon is not running${NC}"
    exit 1
fi

# Check disk space
DISK_USAGE=$(df -h /var/lib/docker | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
    echo -e "${RED}Warning: Disk usage is at ${DISK_USAGE}%${NC}"
    echo -e "${YELLOW}Consider cleaning up Docker images/containers${NC}"
fi

echo -e "${GREEN}✓ Pre-deployment checks passed${NC}\n"

# Step 3: Create backup
echo -e "${YELLOW}[2/8] Creating backup...${NC}"
create_backup
echo -e "${GREEN}✓ Backup complete${NC}\n"

# Step 4: Pull latest images
echo -e "${YELLOW}[3/8] Pulling latest production images...${NC}"
docker-compose -f "$COMPOSE_FILE" pull
echo -e "${GREEN}✓ Images updated${NC}\n"

# Step 5: Graceful shutdown
echo -e "${YELLOW}[4/8] Gracefully shutting down existing container...${NC}"
docker-compose -f "$COMPOSE_FILE" stop || true
sleep 5  # Allow time for graceful shutdown
docker-compose -f "$COMPOSE_FILE" down --remove-orphans || true
echo -e "${GREEN}✓ Existing container stopped${NC}\n"

# Step 6: Start new container
echo -e "${YELLOW}[5/8] Starting new production container...${NC}"
docker-compose -f "$COMPOSE_FILE" up -d
echo -e "${GREEN}✓ Container started${NC}\n"

# Step 7: Health check
echo -e "${YELLOW}[6/8] Running health checks...${NC}"
sleep 5  # Give container time to initialize

if check_health; then
    echo -e "${GREEN}✓ Health check passed${NC}\n"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo -e "${YELLOW}Rolling back deployment...${NC}"
    
    # Attempt rollback
    docker-compose -f "$COMPOSE_FILE" down
    
    # Check if we have a backup to restore
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        echo -e "${YELLOW}Rollback instructions:${NC}"
        echo -e "1. Load backup: ${YELLOW}docker load < $LATEST_BACKUP${NC}"
        echo -e "2. Start previous version manually"
    fi
    
    exit 1
fi

# Step 8: Post-deployment verification
echo -e "${YELLOW}[7/8] Post-deployment verification...${NC}"

# Check container status
CONTAINER_STATUS=$(docker-compose -f "$COMPOSE_FILE" ps -q | xargs docker inspect -f '{{.State.Status}}' 2>/dev/null || echo "not found")
if [ "$CONTAINER_STATUS" = "running" ]; then
    echo -e "${GREEN}✓ Container status: Running${NC}"
else
    echo -e "${RED}✗ Container status: $CONTAINER_STATUS${NC}"
    exit 1
fi

# Test webhook endpoint
echo -e "${YELLOW}Testing webhook endpoint...${NC}"
WEBHOOK_TEST=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$HEALTH_CHECK_URL" -H "Content-Type: application/json" -d '{"test": true}' || echo "000")
if [[ "$WEBHOOK_TEST" =~ ^(200|400|401)$ ]]; then
    echo -e "${GREEN}✓ Webhook endpoint responding (HTTP $WEBHOOK_TEST)${NC}"
else
    echo -e "${RED}⚠️  Webhook endpoint returned unexpected status: HTTP $WEBHOOK_TEST${NC}"
fi

# Step 9: Final status
echo -e "\n${YELLOW}[8/8] Deployment summary...${NC}"

# Show resource usage
echo -e "\n${BLUE}Container Resource Usage:${NC}"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker-compose -f "$COMPOSE_FILE" ps -q)

# Show recent logs
echo -e "\n${BLUE}Recent logs:${NC}"
docker-compose -f "$COMPOSE_FILE" logs --tail=20

# Clean up old images
echo -e "\n${YELLOW}Cleaning up old images...${NC}"
docker image prune -f

echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ PRODUCTION deployment completed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Service URL: ${GREEN}http://localhost:8082${NC}"
echo -e "GitHub Bot: ${GREEN}@${PRODUCTION_BOT}${NC}"
echo -e "Backup: ${GREEN}${LATEST_BACKUP:-No backup created}${NC}"
echo -e "Logs: ${YELLOW}docker-compose -f $COMPOSE_FILE logs -f${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${PURPLE}Remember to monitor the service for the next few minutes!${NC}"