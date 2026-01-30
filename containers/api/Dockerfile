# AgentaOS API Server Container
# Runs the core API and App Manager service

FROM node:20-slim

# Install only essential packages
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for layer caching
COPY core/package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy built core
COPY core/dist ./dist

# Copy shared protocol
COPY shared ./shared

# Use non-root user
USER node

# Environment
ENV NODE_ENV=production
ENV USE_INIT_SOCKET=true
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/system/info || exit 1

CMD ["node", "dist/index.js"]
