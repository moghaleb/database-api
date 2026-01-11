# Use official Node LTS image
FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files first to leverage Docker cache
COPY package.json package-lock.json* ./

# Install dependencies
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
