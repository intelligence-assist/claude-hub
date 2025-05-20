# DevContainer Configuration for Claude Code

This directory contains the Development Container configuration that allows Claude Code CLI to run with elevated permissions using the `--dangerously-skip-permissions` flag.

## Configuration Details

The `devcontainer.json` configuration provides:

1. **Privileged Mode**: Runs the container with `--privileged` flag
2. **Network Capabilities**: Adds NET_ADMIN and NET_RAW for firewall management
3. **System Capabilities**: Includes SYS_TIME, DAC_OVERRIDE, AUDIT_WRITE, and SYS_ADMIN
4. **Docker Socket Mount**: Binds the Docker socket for container management
5. **Post-Create Command**: Automatically runs the firewall initialization script

## Usage

This configuration is used when:
- Running the Claude Code container via webhook triggers
- Executing commands that require system-level permissions
- Managing iptables/ipset for security isolation

## Security Note

The elevated permissions are necessary for:
- Managing firewall rules to restrict outbound traffic
- Running Claude Code CLI with full access to system resources
- Ensuring proper sandbox isolation while maintaining functionality

These permissions are only granted within the isolated container environment and are controlled by the firewall rules defined in `init-firewall.sh`.