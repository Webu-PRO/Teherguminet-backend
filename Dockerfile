# Development Dockerfile for Medusa
FROM node:20-alpine

# Set working directory
WORKDIR /server

# Install build prerequisites for native Node modules
RUN apk add --no-cache python3 make g++

# Copy package files and yarn config
COPY package.json yarn.lock .yarnrc.yml ./

# Install dependencies with the Yarn version pinned in package.json
RUN corepack enable \
  && corepack prepare yarn@1.22.22 --activate \
  && sh -lc 'for attempt in 1 2 3 4 5; do \
    yarn install --pure-lockfile --production=false --network-timeout 600000 && exit 0; \
    echo "yarn install failed (attempt ${attempt}/5), retrying..." >&2; \
    sleep $((attempt * 5)); \
  done; \
  exit 1'

# Copy source code
COPY . .

# Expose the port Medusa runs on
EXPOSE 9000

# Start with migrations and then the development server
CMD ["./start.sh"]
