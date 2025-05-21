#!/bin/bash

# Migration script to transition from static AWS credentials to best practices

echo "AWS Credential Migration Script"
echo "=============================="
echo

# Function to check if running on EC2
check_ec2() {
    if curl -s -m 1 http://169.254.169.254/latest/meta-data/ > /dev/null 2>&1; then
        echo "✅ Running on EC2 instance"
        return 0
    else
        echo "❌ Not running on EC2 instance"
        return 1
    fi
}

# Function to check if running in ECS
check_ecs() {
    if [ -n "${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}" ]; then
        echo "✅ Running in ECS with task role"
        return 0
    else
        echo "❌ Not running in ECS"
        return 1
    fi
}

# Function to check for static credentials
check_static_credentials() {
    if [ -n "${AWS_ACCESS_KEY_ID}" ] && [ -n "${AWS_SECRET_ACCESS_KEY}" ]; then
        echo "⚠️  Found static AWS credentials in environment"
        return 0
    else
        echo "✅ No static credentials in environment"
        return 1
    fi
}

# Function to update .env file
update_env_file() {
    if [ -f .env ]; then
        echo "Updating .env file..."
        
        # Comment out static credentials
        sed -i 's/^AWS_ACCESS_KEY_ID=/#AWS_ACCESS_KEY_ID=/' .env
        sed -i 's/^AWS_SECRET_ACCESS_KEY=/#AWS_SECRET_ACCESS_KEY=/' .env
        
        # Add migration notes
        echo "" >> .env
        echo "# AWS Credentials migrated to use IAM roles/instance profiles" >> .env
        echo "# See docs/aws-authentication-best-practices.md for details" >> .env
        echo "" >> .env
        
        echo "✅ Updated .env file"
    fi
}

# Main migration process
echo "1. Checking current environment..."
echo

if check_ec2; then
    echo "   Recommendation: Use IAM instance profile"
    echo "   The application will automatically use instance metadata"
elif check_ecs; then
    echo "   Recommendation: Use ECS task role"
    echo "   The application will automatically use task credentials"
else
    echo "   Recommendation: Use temporary credentials with STS AssumeRole"
fi

echo
echo "2. Checking for static credentials..."
echo

if check_static_credentials; then
    echo "   ⚠️  WARNING: Static credentials should be replaced with temporary credentials"
    echo
    read -p "   Do you want to disable static credentials? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        update_env_file
        echo
        echo "   To use temporary credentials, configure:"
        echo "   - AWS_ROLE_ARN: The IAM role to assume"
        echo "   - Or use AWS CLI profiles with assume role"
    fi
fi

echo
echo "3. Testing new credential provider..."
echo

# Test the credential provider
node test/test-aws-credential-provider.js

echo
echo "Migration complete!"
echo
echo "Next steps:"
echo "1. Review docs/aws-authentication-best-practices.md"
echo "2. Update your deployment configuration"
echo "3. Test the application with new credential provider"
echo "4. Remove update-aws-creds.sh script (no longer needed)"
echo

# Check if update-aws-creds.sh exists and suggest removal
if [ -f update-aws-creds.sh ]; then
    echo "⚠️  Found update-aws-creds.sh - this script is no longer needed"
    read -p "Do you want to remove it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm update-aws-creds.sh
        echo "✅ Removed update-aws-creds.sh"
    fi
fi