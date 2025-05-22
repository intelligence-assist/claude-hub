#!/bin/bash

# Script to create AWS profiles programmatically
# Usage: ./create-aws-profile.sh <profile-name> <access-key-id> <secret-access-key> [region] [output-format]

if [ $# -lt 3 ]; then
    echo "Usage: $0 <profile-name> <access-key-id> <secret-access-key> [region] [output-format]"
    echo "Example: $0 claude-webhook EXAMPLE_KEY_ID EXAMPLE_SECRET_KEY us-west-2 json"
    exit 1
fi

PROFILE_NAME=$1
ACCESS_KEY_ID=$2
SECRET_ACCESS_KEY=$3
REGION=${4:-us-west-2}
OUTPUT_FORMAT=${5:-json}

echo "Creating AWS profile: $PROFILE_NAME"

# Create the profile
aws configure set aws_access_key_id "$ACCESS_KEY_ID" --profile "$PROFILE_NAME"
aws configure set aws_secret_key "$SECRET_ACCESS_KEY" --profile "$PROFILE_NAME"
aws configure set region "$REGION" --profile "$PROFILE_NAME"
aws configure set output "$OUTPUT_FORMAT" --profile "$PROFILE_NAME"

# Verify the profile
echo "Verifying profile..."
if aws sts get-caller-identity --profile "$PROFILE_NAME" >/dev/null 2>&1; then
    echo "✅ Profile '$PROFILE_NAME' created and verified successfully!"
    
    # Show account info
    echo "Account info:"
    aws sts get-caller-identity --profile "$PROFILE_NAME" --output table
else
    echo "❌ Profile created but authentication failed. Please check your credentials."
    exit 1
fi

echo
echo "To use this profile, set in your .env file:"
echo "USE_AWS_PROFILE=true"
echo "AWS_PROFILE=$PROFILE_NAME"