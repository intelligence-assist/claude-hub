#!/bin/bash

# Test container with a volume mount for output
OUTPUT_DIR="/tmp/claude-output"
OUTPUT_FILE="$OUTPUT_DIR/output.txt"

echo "Docker Container Volume Test"
echo "=========================="

# Ensure output directory exists and is empty
mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_FILE"

# Run container with volume mount for output
docker run --rm \
  -v "$OUTPUT_DIR:/output" \
  claudecode:latest \
  bash -c "echo 'Hello from container' > /output/output.txt && echo 'Command executed successfully.'"

# Check if output file was created
echo
echo "Checking for output file: $OUTPUT_FILE"
if [ -f "$OUTPUT_FILE" ]; then
  echo "Output file created. Contents:"
  cat "$OUTPUT_FILE"
else
  echo "No output file was created."
fi