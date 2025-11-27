#!/bin/bash

echo "🚀 Deploying Logixmotion Site..."

# Stop and remove existing container (including orphans)
echo "📦 Stopping existing container..."
docker compose down --remove-orphans
docker stop logixmotion_web 2>/dev/null || true
docker rm logixmotion_web 2>/dev/null || true

# Rebuild the image
echo "🔨 Building new image..."
docker compose build --no-cache

# Start the container
echo "▶️  Starting container..."
docker compose up -d

# Show status
echo "✅ Deployment complete!"
echo ""
docker compose ps
echo ""
echo "📋 View logs with: docker compose logs -f"