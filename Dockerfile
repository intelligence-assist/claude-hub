# syntax=docker/dockerfile:1

# Build stage - compile TypeScript and prepare production files
FROM node:24-slim AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json tsconfig.json babel.config.js ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Copy remaining application files
COPY . .

# Production dependency stage - smaller layer for dependencies
FROM node:24-slim AS prod-deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Test stage - includes dev dependencies and test files
FROM node:24-slim AS test

# Set shell with pipefail option
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json tsconfig*.json babel.config.js jest.config.js ./
RUN npm ci

# Copy source and test files
COPY src/ ./src/
COPY test/ ./test/
COPY scripts/ ./scripts/

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set test environment
ENV NODE_ENV=test

# Run tests by default in this stage
CMD ["npm", "test"]

# Production stage - minimal runtime image
FROM node:24-slim AS production

# Set shell with pipefail option for better error handling
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install runtime dependencies with pinned versions
RUN apt-get update && apt-get install -y --no-install-recommends \
    git=1:2.39.5-0+deb12u2 \
    curl=7.88.1-10+deb12u12 \
    python3=3.11.2-1+b1 \
    python3-pip=23.0.1+dfsg-1 \
    python3-venv=3.11.2-1+b1 \
    expect=5.45.4-2+b1 \
    ca-certificates=20230311 \
    gnupg=2.2.40-1.1 \
    lsb-release=12.0-1 \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (not the daemon, just the client) with consolidated RUN and pinned versions
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli=5:27.* \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code (latest version)
# hadolint ignore=DL3016
RUN npm install -g @anthropic-ai/claude-code

# Create docker group first, then create a non-root user for running the application
RUN groupadd -g 999 docker 2>/dev/null || true \
    && useradd -m -u 1001 -s /bin/bash claudeuser \
    && usermod -aG docker claudeuser 2>/dev/null || true

# Create claude config directory
RUN mkdir -p /home/claudeuser/.config/claude

WORKDIR /app

# Copy production dependencies from prod-deps stage
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy configuration and runtime files
COPY package*.json tsconfig.json babel.config.js ./
COPY claude-config.json /home/claudeuser/.config/claude/config.json
COPY scripts/ ./scripts/
COPY docs/ ./docs/
COPY cli/ ./cli/

# Set permissions
RUN chown -R claudeuser:claudeuser /home/claudeuser/.config /app \
    && chmod +x /app/scripts/runtime/startup.sh

# Expose the port
EXPOSE 3002

# Set default environment variables
ENV NODE_ENV=production \
    PORT=3002

# Stay as root user to run Docker commands
# (The container will need to run with Docker socket mounted)

# Run the startup script
CMD ["bash", "/app/scripts/runtime/startup.sh"]