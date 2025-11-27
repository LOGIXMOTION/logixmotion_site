#!/bin/bash

echo "🚀 Deploying Logixmotion Site..."

# Stop and remove existing container
echo "📦 Stopping existing container..."
docker compose down

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