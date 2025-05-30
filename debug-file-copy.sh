#!/bin/bash
set -e

echo "=== Debugging Claude Auth File Copying ==="

# Test the exact same logic as the entrypoint scripts
SOURCE_DIR="/home/node/.claude"
DEST_DIR="/workspace/.claude"

echo "1. Checking source directory..."
if [ -d "$SOURCE_DIR" ]; then
  echo "✓ Source directory exists: $SOURCE_DIR"
  echo "Source contents:"
  ls -la "$SOURCE_DIR/" || echo "ERROR: Cannot list source directory"
  
  echo "Checking .credentials.json specifically:"
  if [ -f "$SOURCE_DIR/.credentials.json" ]; then
    echo "✓ .credentials.json exists in source"
    echo "Size: $(stat -c%s "$SOURCE_DIR/.credentials.json" 2>/dev/null || echo 'unknown') bytes"
    echo "Permissions: $(stat -c%a "$SOURCE_DIR/.credentials.json" 2>/dev/null || echo 'unknown')"
  else
    echo "✗ .credentials.json NOT found in source"
  fi
else
  echo "✗ Source directory does not exist: $SOURCE_DIR"
  exit 1
fi

echo -e "\n2. Creating destination directory..."
mkdir -p "$DEST_DIR"
echo "✓ Destination directory created: $DEST_DIR"

echo -e "\n3. Testing rsync copy..."
if command -v rsync >/dev/null 2>&1; then
  echo "Using rsync for copy..."
  rsync -av "$SOURCE_DIR/" "$DEST_DIR/" || echo "ERROR: rsync failed"
else
  echo "rsync not available, using cp..."
  cp -r "$SOURCE_DIR"/* "$DEST_DIR/" 2>/dev/null || true
  cp -r "$SOURCE_DIR"/.* "$DEST_DIR/" 2>/dev/null || true
fi

echo -e "\n4. Checking destination after copy..."
if [ -d "$DEST_DIR" ]; then
  echo "✓ Destination directory exists after copy"
  echo "Destination contents:"
  ls -la "$DEST_DIR/" || echo "ERROR: Cannot list destination directory"
  
  echo "Checking .credentials.json in destination:"
  if [ -f "$DEST_DIR/.credentials.json" ]; then
    echo "✓ .credentials.json successfully copied"
    echo "Size: $(stat -c%s "$DEST_DIR/.credentials.json" 2>/dev/null || echo 'unknown') bytes"
    echo "Permissions: $(stat -c%a "$DEST_DIR/.credentials.json" 2>/dev/null || echo 'unknown')"
    echo "First 100 chars of content:"
    head -c 100 "$DEST_DIR/.credentials.json" 2>/dev/null || echo "ERROR: Cannot read file"
  else
    echo "✗ .credentials.json NOT copied to destination"
  fi
else
  echo "✗ Destination directory does not exist after copy"
fi

echo -e "\n5. Setting permissions..."
chown -R node:node "$DEST_DIR" 2>/dev/null || echo "WARNING: Cannot change ownership"
chmod 600 "$DEST_DIR/.credentials.json" 2>/dev/null || echo "WARNING: Cannot change file permissions"
chmod 755 "$DEST_DIR" 2>/dev/null || echo "WARNING: Cannot change directory permissions"

echo -e "\n6. Final verification..."
if [ -f "$DEST_DIR/.credentials.json" ]; then
  echo "✓ Final check: .credentials.json exists and is accessible"
  echo "Final permissions: $(stat -c%a "$DEST_DIR/.credentials.json" 2>/dev/null || echo 'unknown')"
  echo "Owner: $(stat -c%U:%G "$DEST_DIR/.credentials.json" 2>/dev/null || echo 'unknown')"
else
  echo "✗ Final check: .credentials.json still missing"
fi

echo -e "\n=== Debug Complete ==="