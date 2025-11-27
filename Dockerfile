# Use official Node LTS image based on Debian
FROM node:18-bullseye-slim

# Install ffmpeg (system package) and ca-certificates for https
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files first and install deps (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --only=production

# Copy app sources
COPY . .

# Ensure cache dir exists and is writable
RUN mkdir -p /usr/src/app/cache && chmod -R 0777 /usr/src/app/cache

# Expose port used by server (default 3000)
EXPOSE 3000

# Use non-root user for better security
RUN useradd --user-group --create-home --shell /bin/false appuser || true
RUN chown -R appuser:appuser /usr/src/app
USER appuser

# Start server
CMD ["node", "server.js"]
