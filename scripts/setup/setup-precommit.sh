#!/bin/bash

echo "Setting up pre-commit hooks for credential scanning..."

# Check if Python is installed
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "Error: Python is required for pre-commit. Please install Python 3."
    exit 1
fi

# Install pre-commit if not already installed
if ! command -v pre-commit &> /dev/null; then
    echo "Installing pre-commit..."
    pip install pre-commit || pip3 install pre-commit
fi

# Install detect-secrets if not already installed
if ! command -v detect-secrets &> /dev/null; then
    echo "Installing detect-secrets..."
    pip install detect-secrets || pip3 install detect-secrets
fi

# Install the git hooks
echo "Installing pre-commit hooks..."
pre-commit install

# Run initial scan to populate baseline
echo "Generating secrets baseline..."
detect-secrets scan > .secrets.baseline

echo "Pre-commit hooks installed successfully!"
echo "Run 'pre-commit run --all-files' to test the hooks"