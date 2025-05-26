FROM node:24-slim

# Set shell with pipefail option for better error handling
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install git, Claude Code, Docker, and required dependencies with pinned versions and --no-install-recommends
RUN apt-get update && apt-get install -y --no-install-recommends \
    git=1:2.39.5-0+deb12u2 \
    curl=7.88.1-10+deb12u12 \
    python3=3.11.2-1+b1 \
    python3-pip=23.0.1+dfsg-1+deb12u1 \
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

# Install Claude Code with pinned version
RUN npm install -g @anthropic-ai/claude-code@1.0.3

# Create docker group first, then create a non-root user for running the application
RUN groupadd -g 999 docker 2>/dev/null || true \
    && useradd -m -u 1001 -s /bin/bash claudeuser \
    && usermod -aG docker claudeuser 2>/dev/null || true

# Create claude config directory and copy config
RUN mkdir -p /home/claudeuser/.config/claude
COPY claude-config.json /home/claudeuser/.config/claude/config.json

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Consolidate permission changes into a single RUN instruction
RUN chown -R claudeuser:claudeuser /home/claudeuser/.config /app \
    && chmod +x /app/scripts/runtime/startup.sh

# Note: Docker socket will be mounted at runtime, no need to create it here

# Expose the port
EXPOSE 3002

# Set default environment variables
ENV NODE_ENV=production \
    PORT=3002

# Stay as root user to run Docker commands
# (The container will need to run with Docker socket mounted)

# Run the startup script
CMD ["bash", "/app/scripts/runtime/startup.sh"]