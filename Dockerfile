# Build stage for UI
FROM node:20-slim AS ui-builder
WORKDIR /build

# Copy UI package files
COPY ui/package*.json ./ui/
WORKDIR /build/ui
RUN npm install

# Copy UI source and build
COPY ui/ ./
RUN npm run build

# Build stage for Core
FROM node:20-slim AS core-builder
WORKDIR /build

# Copy core package files
COPY core/package*.json ./core/
WORKDIR /build/core
RUN npm install

# Copy core source and build
COPY core/ ./
RUN npm run build

# Production stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Podman
RUN apt-get update && apt-get install -y \
    podman \
    fuse-overlayfs \
    slirp4netns \
    uidmap \
    && rm -rf /var/lib/apt/lists/*

# Create agentaos user for rootless Podman
RUN useradd -m -u 1000 agentaos \
    && echo "agentaos:100000:65536" >> /etc/subuid \
    && echo "agentaos:100000:65536" >> /etc/subgid

# Set up AgentaOS directories
WORKDIR /agentaos

# Copy built core
COPY --from=core-builder /build/core/dist ./core/dist
COPY --from=core-builder /build/core/package*.json ./core/
COPY --from=core-builder /build/core/node_modules ./core/node_modules

# Copy built UI
COPY --from=ui-builder /build/ui/dist ./ui/dist

# Create data directories
RUN mkdir -p /data/documents /data/apps /data/system /data/containers \
    && chown -R agentaos:agentaos /data \
    && chown -R agentaos:agentaos /agentaos

# Environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV UI_DIR=/agentaos/ui/dist
ENV PORT=80
ENV HOST=0.0.0.0

# Podman configuration for rootless
ENV _CONTAINERS_USERNS_CONFIGURED=""

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:80/api/system/info || exit 1

# Run as agentaos user
USER agentaos

WORKDIR /agentaos/core

CMD ["node", "dist/index.js"]
