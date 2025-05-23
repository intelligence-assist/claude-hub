#!/bin/bash

# Docker Hub publishing script for Claude GitHub Webhook
# Usage: ./publish-docker.sh YOUR_DOCKERHUB_USERNAME [VERSION]

DOCKERHUB_USERNAME=${1:-intelligenceassist}
VERSION=${2:-latest}

# Default to intelligenceassist organization

IMAGE_NAME="claude-github-webhook"
FULL_IMAGE_NAME="$DOCKERHUB_USERNAME/$IMAGE_NAME"

echo "Building Docker image..."
docker build -t $IMAGE_NAME:latest .

echo "Tagging image as $FULL_IMAGE_NAME:$VERSION..."
docker tag $IMAGE_NAME:latest $FULL_IMAGE_NAME:$VERSION

if [ "$VERSION" != "latest" ]; then
    echo "Also tagging as $FULL_IMAGE_NAME:latest..."
    docker tag $IMAGE_NAME:latest $FULL_IMAGE_NAME:latest
fi

echo "Logging in to Docker Hub..."
docker login

echo "Pushing to Docker Hub..."
docker push $FULL_IMAGE_NAME:$VERSION

if [ "$VERSION" != "latest" ]; then
    docker push $FULL_IMAGE_NAME:latest
fi

echo "Successfully published to Docker Hub!"
echo "Users can now pull with: docker pull $FULL_IMAGE_NAME:$VERSION"