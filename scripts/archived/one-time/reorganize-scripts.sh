#!/bin/bash
set -e

# Script to reorganize the script files according to the proposed structure
echo "Starting script reorganization..."

# Create directory structure
echo "Creating directory structure..."
mkdir -p scripts/setup
mkdir -p scripts/build
mkdir -p scripts/aws
mkdir -p scripts/runtime
mkdir -p scripts/security
mkdir -p scripts/utils

mkdir -p test/integration
mkdir -p test/aws
mkdir -p test/container
mkdir -p test/claude
mkdir -p test/security
mkdir -p test/utils

# Move setup scripts
echo "Moving setup scripts..."
git mv scripts/setup.sh scripts/setup/
git mv scripts/setup-precommit.sh scripts/setup/
git mv setup-claude-auth.sh scripts/setup/
git mv setup-new-repo.sh scripts/setup/
git mv create-new-repo.sh scripts/setup/

# Move build scripts
echo "Moving build scripts..."
git mv build-claude-container.sh scripts/build/
git mv build-claudecode.sh scripts/build/
git mv update-production-image.sh scripts/build/

# Move AWS scripts
echo "Moving AWS scripts..."
git mv scripts/create-aws-profile.sh scripts/aws/
git mv scripts/migrate-aws-credentials.sh scripts/aws/
git mv scripts/setup-aws-profiles.sh scripts/aws/
git mv update-aws-creds.sh scripts/aws/

# Move runtime scripts
echo "Moving runtime scripts..."
git mv start-api.sh scripts/runtime/
git mv entrypoint.sh scripts/runtime/
git mv claudecode-entrypoint.sh scripts/runtime/
git mv startup.sh scripts/runtime/
git mv claude-wrapper.sh scripts/runtime/

# Move security scripts
echo "Moving security scripts..."
git mv init-firewall.sh scripts/security/
git mv accept-permissions.sh scripts/security/
git mv fix-credential-references.sh scripts/security/

# Move utility scripts
echo "Moving utility scripts..."
git mv scripts/ensure-test-dirs.sh scripts/utils/
git mv prepare-clean-repo.sh scripts/utils/
git mv volume-test.sh scripts/utils/

# Move test scripts
echo "Moving test scripts..."
git mv test/test-full-flow.sh test/integration/
git mv test/test-claudecode-docker.sh test/integration/

git mv test/test-aws-profile.sh test/aws/
git mv test/test-aws-mount.sh test/aws/

git mv test/test-basic-container.sh test/container/
git mv test/test-container-cleanup.sh test/container/
git mv test/test-container-privileged.sh test/container/

git mv test/test-claude-direct.sh test/claude/
git mv test/test-claude-no-firewall.sh test/claude/
git mv test/test-claude-installation.sh test/claude/
git mv test/test-claude-version.sh test/claude/
git mv test/test-claude-response.sh test/claude/
git mv test/test-direct-claude.sh test/claude/

git mv test/test-firewall.sh test/security/
git mv test/test-with-auth.sh test/security/
git mv test/test-github-token.sh test/security/

# Create wrapper scripts for backward compatibility
echo "Creating wrapper scripts for backward compatibility..."

cat > setup-claude-auth.sh << 'EOF'
#!/bin/bash
# Wrapper script for backward compatibility
echo "This script is now located at scripts/setup/setup-claude-auth.sh"
exec scripts/setup/setup-claude-auth.sh "$@"
EOF
chmod +x setup-claude-auth.sh

cat > build-claudecode.sh << 'EOF'
#!/bin/bash
# Wrapper script for backward compatibility
echo "This script is now located at scripts/build/build-claudecode.sh"
exec scripts/build/build-claudecode.sh "$@"
EOF
chmod +x build-claudecode.sh

cat > start-api.sh << 'EOF'
#!/bin/bash
# Wrapper script for backward compatibility
echo "This script is now located at scripts/runtime/start-api.sh"
exec scripts/runtime/start-api.sh "$@"
EOF
chmod +x start-api.sh

# Update docker-compose.yml file if it references specific script paths
echo "Checking for docker-compose.yml updates..."
if [ -f docker-compose.yml ]; then
  sed -i 's#./claudecode-entrypoint.sh#./scripts/runtime/claudecode-entrypoint.sh#g' docker-compose.yml
  sed -i 's#./entrypoint.sh#./scripts/runtime/entrypoint.sh#g' docker-compose.yml
fi

# Update Dockerfile.claudecode if it references specific script paths
echo "Checking for Dockerfile.claudecode updates..."
if [ -f Dockerfile.claudecode ]; then
  sed -i 's#COPY init-firewall.sh#COPY scripts/security/init-firewall.sh#g' Dockerfile.claudecode
  sed -i 's#COPY claudecode-entrypoint.sh#COPY scripts/runtime/claudecode-entrypoint.sh#g' Dockerfile.claudecode
fi

echo "Script reorganization complete!"
echo
echo "Please review the changes and test that all scripts still work properly."
echo "You may need to update additional references in other files or scripts."
echo
echo "To commit these changes, run:"
echo "git add ."
echo "git commit -m \"Reorganize scripts into a more structured directory layout\""