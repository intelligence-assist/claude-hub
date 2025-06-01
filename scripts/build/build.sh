#!/bin/bash
# Consolidated build script
# Usage: ./build.sh [claude|claudecode|production]

set -e

BUILD_TYPE=${1:-claudecode}

case "$BUILD_TYPE" in
  claude)
    echo "Building Claude container..."
    docker build -f Dockerfile.claude -t claude-container:latest .
    ;;
  
  claudecode)
    echo "Building Claude Code runner Docker image..."
    docker build -f Dockerfile.claudecode -t claudecode:latest .
    ;;
  
  production)
    if [ ! -d "./claude-config" ]; then
      echo "Error: claude-config directory not found."
      echo "Please run ./scripts/setup/setup-claude-auth.sh first and copy the config."
      exit 1
    fi
    
    echo "Building production image with pre-authenticated config..."
    
    # Create a temporary production Dockerfile with claude-config enabled
    cat > Dockerfile.claudecode.prod << 'EOF'
FROM node:24

# Install dependencies
RUN apt update && apt install -y less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq

# Set up npm global directory
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

# Configure zsh and command history
ENV USERNAME=node
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Create workspace and config directories
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

# Switch to node user temporarily for npm install
USER node
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Install Claude Code  
RUN npm install -g @anthropic-ai/claude-code

# Switch back to root
USER root

# Copy the pre-authenticated Claude config to BOTH root and node user (PRODUCTION ONLY)
COPY claude-config /root/.claude
COPY claude-config /home/node/.claude
RUN chown -R node:node /home/node/.claude

# Copy the rest of the setup
WORKDIR /workspace

# Install delta and zsh
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/0.18.2/git-delta_0.18.2_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_0.18.2_${ARCH}.deb" && \
  rm "git-delta_0.18.2_${ARCH}.deb"

RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v1.2.0/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Copy firewall and entrypoint scripts
COPY scripts/security/init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall

# Create scripts directory and copy unified entrypoint script
RUN mkdir -p /scripts/runtime
COPY scripts/runtime/claudecode-entrypoint.sh /usr/local/bin/entrypoint.sh
COPY scripts/runtime/claudecode-entrypoint.sh /scripts/runtime/claudecode-entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && \
  chmod +x /scripts/runtime/claudecode-entrypoint.sh

# Set the default shell to bash
ENV SHELL /bin/zsh
ENV DEVCONTAINER=true

# Run as root to allow permission management
USER root

# Use the custom entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
EOF
    
    # Build the production image
    docker build -f Dockerfile.claudecode.prod -t claudecode:production .
    
    # Clean up temporary file
    rm -f Dockerfile.claudecode.prod
    ;;
  
  *)
    echo "Unknown build type: $BUILD_TYPE"
    echo "Usage: ./build.sh [claude|claudecode|production]"
    exit 1
    ;;
esac

echo "Build complete!"
