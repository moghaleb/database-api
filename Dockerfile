# Use official Node image (Debian-based for native module compatibility)
FROM node:24-bookworm-slim

# Install build tools for native modules (sqlite3, etc.)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files first to leverage Docker cache
COPY package.json package-lock.json* ./

# Install dependencies (will build sqlite3 from source if needed)
RUN npm install --production

# Copy app sources
COPY . .

# Ensure data directory exists
RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app/data

# Use non-root user
USER node

# Expose default port (your app reads PORT env var)
EXPOSE 10000

# Recommended envs when running the container
ENV NODE_ENV=production
ENV PORT=10000

CMD ["node", "server.js"]
