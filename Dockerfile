FROM node:18-slim

# Install git, Claude Code, Docker, and required dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    expect \
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (not the daemon, just the client)
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Create docker group first, then create a non-root user for running the application
RUN groupadd -g 999 docker || true \
    && useradd -m -u 1001 -s /bin/bash claudeuser \
    && usermod -aG docker claudeuser || true

# Create claude config directory and copy config
RUN mkdir -p /home/claudeuser/.config/claude
COPY claude-config.json /home/claudeuser/.config/claude/config.json
RUN chown -R claudeuser:claudeuser /home/claudeuser/.config

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Make startup script executable
RUN chmod +x /app/scripts/runtime/startup.sh

# Note: Docker socket will be mounted at runtime, no need to create it here

# Change ownership of the app directory to the non-root user
RUN chown -R claudeuser:claudeuser /app

# Expose the port
EXPOSE 3002

# Set default environment variables
ENV NODE_ENV=production \
    PORT=3002

# Stay as root user to run Docker commands
# (The container will need to run with Docker socket mounted)

# Run the startup script
CMD ["bash", "/app/scripts/runtime/startup.sh"]