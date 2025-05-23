#!/bin/bash

# Claude Webhook Staging Deployment Script
# Deploys the staging environment on port 8083

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
COMPOSE_FILE="docker-compose.staging.yml"
SERVICE_NAME="webhook-staging"
HEALTH_CHECK_URL="http://localhost:8083/health"
MAX_HEALTH_RETRIES=30
STAGING_BOT="MCPClaude-Staging"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                    Claude Webhook - Staging Deployment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Bot: ${GREEN}@${STAGING_BOT}${NC}"
echo -e "Port: ${GREEN}8083${NC}"
echo -e "Time: ${GREEN}$(date)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

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

# Step 1: Pre-deployment checks
echo -e "${YELLOW}[1/6] Running pre-deployment checks...${NC}"

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

echo -e "${GREEN}✓ Pre-deployment checks passed${NC}\n"

# Step 2: Pull latest images
echo -e "${YELLOW}[2/6] Pulling latest staging images...${NC}"
docker-compose -f "$COMPOSE_FILE" pull
echo -e "${GREEN}✓ Images updated${NC}\n"

# Step 3: Stop existing container
echo -e "${YELLOW}[3/6] Stopping existing staging container...${NC}"
docker-compose -f "$COMPOSE_FILE" down --remove-orphans || true
echo -e "${GREEN}✓ Existing container stopped${NC}\n"

# Step 4: Start new container
echo -e "${YELLOW}[4/6] Starting new staging container...${NC}"
docker-compose -f "$COMPOSE_FILE" up -d
echo -e "${GREEN}✓ Container started${NC}\n"

# Step 5: Health check
echo -e "${YELLOW}[5/6] Running health checks...${NC}"
sleep 5  # Give container time to initialize

if check_health; then
    echo -e "${GREEN}✓ Health check passed${NC}\n"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo -e "${YELLOW}Checking container logs...${NC}"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50
    exit 1
fi

# Step 6: Post-deployment verification
echo -e "${YELLOW}[6/6] Post-deployment verification...${NC}"

# Check container status
CONTAINER_STATUS=$(docker-compose -f "$COMPOSE_FILE" ps -q | xargs docker inspect -f '{{.State.Status}}' 2>/dev/null || echo "not found")
if [ "$CONTAINER_STATUS" = "running" ]; then
    echo -e "${GREEN}✓ Container status: Running${NC}"
else
    echo -e "${RED}✗ Container status: $CONTAINER_STATUS${NC}"
    exit 1
fi

# Show resource usage
echo -e "\n${BLUE}Container Resource Usage:${NC}"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker-compose -f "$COMPOSE_FILE" ps -q)

# Show recent logs
echo -e "\n${BLUE}Recent logs:${NC}"
docker-compose -f "$COMPOSE_FILE" logs --tail=10

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Staging deployment completed successfully!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Service URL: ${GREEN}http://localhost:8083${NC}"
echo -e "GitHub Bot: ${GREEN}@${STAGING_BOT}${NC}"
echo -e "Logs: ${YELLOW}docker-compose -f $COMPOSE_FILE logs -f${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"