FROM node:20-slim

WORKDIR /app

# Copy app files
COPY server.js ./
COPY app.json ./

# App listens on port 3000
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
