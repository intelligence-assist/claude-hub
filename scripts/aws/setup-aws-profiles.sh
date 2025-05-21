#!/bin/bash

# Script to set up AWS profiles for Claude webhook service
# This avoids storing credentials in environment variables

echo "AWS Profile Setup for Claude Webhook"
echo "===================================="
echo

# Function to create a profile
create_aws_profile() {
    local profile_name=$1
    local description=$2
    
    echo "Setting up profile: $profile_name ($description)"
    echo
    
    # Check if profile already exists
    if aws configure list --profile "$profile_name" &>/dev/null; then
        echo "Profile '$profile_name' already exists."
        read -p "Do you want to update it? (y/n): " update_profile
        if [[ $update_profile != "y" ]]; then
            echo "Skipping profile '$profile_name'"
            return
        fi
    fi
    
    # Get credentials
    read -p "AWS Access Key ID: " access_key
    read -s -p "AWS Secret Access Key: " secret_key
    echo
    read -p "Default region [us-west-2]: " region
    region=${region:-us-west-2}
    read -p "Output format [json]: " output
    output=${output:-json}
    
    # Set the profile using AWS CLI
    aws configure set aws_access_key_id "$access_key" --profile "$profile_name"
    aws configure set aws_secret_key "$secret_key" --profile "$profile_name"
    aws configure set region "$region" --profile "$profile_name"
    aws configure set output "$output" --profile "$profile_name"
    
    echo "✅ Profile '$profile_name' created successfully!"
    echo
}

# Main menu
echo "Which profiles would you like to set up?"
echo "1. claude-webhook (default profile for the service)"
echo "2. claude-dev (development environment)"
echo "3. claude-prod (production environment)"
echo "4. All of the above"
echo "5. Custom profile name"
echo

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        create_aws_profile "claude-webhook" "Default profile for Claude webhook service"
        ;;
    2)
        create_aws_profile "claude-dev" "Development environment"
        ;;
    3)
        create_aws_profile "claude-prod" "Production environment"
        ;;
    4)
        create_aws_profile "claude-webhook" "Default profile for Claude webhook service"
        create_aws_profile "claude-dev" "Development environment"
        create_aws_profile "claude-prod" "Production environment"
        ;;
    5)
        read -p "Enter custom profile name: " custom_name
        read -p "Enter description: " custom_desc
        create_aws_profile "$custom_name" "$custom_desc"
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

# Update .env file
echo
echo "Updating .env file configuration..."

ENV_FILE="../.env"

# Backup existing .env
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.backup"
    echo "Backed up existing .env to .env.backup"
fi

# Function to update .env
update_env_file() {
    local profile_name=$1
    
    # Remove old AWS credential lines
    if [ -f "$ENV_FILE" ]; then
        sed -i.tmp '/^AWS_ACCESS_KEY_ID=/d' "$ENV_FILE"
        sed -i.tmp '/^AWS_SECRET_ACCESS_KEY=/d' "$ENV_FILE"
        rm "$ENV_FILE.tmp"
    fi
    
    # Add new profile configuration
    if grep -q "^USE_AWS_PROFILE=" "$ENV_FILE" 2>/dev/null; then
        sed -i.tmp "s/^USE_AWS_PROFILE=.*/USE_AWS_PROFILE=true/" "$ENV_FILE"
    else
        echo "USE_AWS_PROFILE=true" >> "$ENV_FILE"
    fi
    
    if grep -q "^AWS_PROFILE=" "$ENV_FILE" 2>/dev/null; then
        sed -i.tmp "s/^AWS_PROFILE=.*/AWS_PROFILE=$profile_name/" "$ENV_FILE"
    else
        echo "AWS_PROFILE=$profile_name" >> "$ENV_FILE"
    fi
    
    if [ -f "$ENV_FILE.tmp" ]; then
        rm "$ENV_FILE.tmp"
    fi
    
    echo "✅ Updated .env to use AWS profile: $profile_name"
}

# Ask which profile to use in .env
echo
echo "Which profile should be used in the .env file?"
aws configure list-profiles | nl -v 1
echo
read -p "Enter the number or profile name: " env_choice

if [[ $env_choice =~ ^[0-9]+$ ]]; then
    # User entered a number
    profile_to_use=$(aws configure list-profiles | sed -n "${env_choice}p")
else
    # User entered a profile name
    profile_to_use=$env_choice
fi

if [ -n "$profile_to_use" ]; then
    update_env_file "$profile_to_use"
fi

# Test the profile
echo
echo "Testing AWS profile configuration..."
if aws sts get-caller-identity --profile "$profile_to_use" &>/dev/null; then
    echo "✅ Profile '$profile_to_use' is working correctly!"
    aws sts get-caller-identity --profile "$profile_to_use" --output table
else
    echo "❌ Failed to authenticate with profile '$profile_to_use'"
    echo "Please check your credentials and try again."
fi

echo
echo "Setup complete!"
echo
echo "Next steps:"
echo "1. Rebuild the Docker image: ./build-claudecode.sh"
echo "2. Start the service: npm start"
echo "3. Your AWS credentials are now stored securely in ~/.aws/credentials"
echo
echo "To switch profiles later, update AWS_PROFILE in .env"