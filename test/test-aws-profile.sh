#!/bin/bash

# Test script to verify AWS profile authentication is working

echo "AWS Profile Authentication Test"
echo "==============================="
echo

# Source .env file if it exists
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
    echo "Loaded configuration from .env"
else
    echo "No .env file found"
fi

echo
echo "Current configuration:"
echo "USE_AWS_PROFILE: ${USE_AWS_PROFILE:-not set}"
echo "AWS_PROFILE: ${AWS_PROFILE:-not set}"
echo "AWS_REGION: ${AWS_REGION:-not set}"
echo

# Test if profile exists
if [ "$USE_AWS_PROFILE" = "true" ] && [ -n "$AWS_PROFILE" ]; then
    echo "Testing AWS profile: $AWS_PROFILE"
    
    # Check if profile exists in credentials file
    if aws configure list --profile "$AWS_PROFILE" >/dev/null 2>&1; then
        echo "✅ Profile exists in AWS credentials"
        
        # Test authentication
        echo
        echo "Testing authentication..."
        if aws sts get-caller-identity --profile "$AWS_PROFILE" >/dev/null 2>&1; then
            echo "✅ Authentication successful!"
            echo
            echo "Account details:"
            aws sts get-caller-identity --profile "$AWS_PROFILE" --output table
            
            # Test Claude service access
            echo
            echo "Testing access to Claude service (Bedrock)..."
            if aws bedrock list-foundation-models --profile "$AWS_PROFILE" --region "$AWS_REGION" >/dev/null 2>&1; then
                echo "✅ Can access Bedrock service"
                
                # Check for Claude models
                echo "Available Claude models:"
                aws bedrock list-foundation-models --profile "$AWS_PROFILE" --region "$AWS_REGION" \
                    --query "modelSummaries[?contains(modelId, 'claude')].{ID:modelId,Name:modelName}" \
                    --output table
            else
                echo "❌ Cannot access Bedrock service. Check permissions."
            fi
        else
            echo "❌ Authentication failed. Check your credentials."
        fi
    else
        echo "❌ Profile '$AWS_PROFILE' not found in AWS credentials"
        echo
        echo "Available profiles:"
        aws configure list-profiles
    fi
else
    echo "AWS profile usage is not enabled or profile not set."
    echo "Using environment variables for authentication."
    
    # Test with environment variables
    if [ -n "$AWS_ACCESS_KEY_ID" ]; then
        echo
        echo "Testing with environment variables..."
        if aws sts get-caller-identity >/dev/null 2>&1; then
            echo "✅ Authentication successful with environment variables"
        else
            echo "❌ Authentication failed with environment variables"
        fi
    else
        echo "No AWS credentials found in environment variables either."
    fi
fi

echo
echo "Test complete!"