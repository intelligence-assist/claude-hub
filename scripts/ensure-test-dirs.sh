#!/bin/bash
# Create required test directories for CI integration

# Define the directories to create
TEST_DIRS=(
  "test/unit/controllers"
  "test/unit/services"
  "test/unit/utils"
  "test/integration/github"
  "test/integration/claude"
  "test/integration/aws"
  "test/e2e/scenarios"
  "test/e2e/scripts"
  "test-results/jest"
  "coverage"
)

# Create the directories
for dir in "${TEST_DIRS[@]}"; do
  mkdir -p "$dir"
  echo "Created directory: $dir"
done

echo "Test directories are ready for CI integration."