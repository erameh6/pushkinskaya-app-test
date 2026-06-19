# Dockerfile — packages the Pushkinskaya guide into a portable container.
# Build:  docker build -t pushkinskaya .
# Run:    docker run -p 4000:4000 -v "$(pwd)/signatures.json:/app/signatures.json" pushkinskaya

# Small, current Node base image.
FROM node:20-slim

# App lives in /app inside the container.
WORKDIR /app

# Install dependencies first (this layer is cached unless package files change,
# so rebuilds are fast when you only edit source code).
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app (source, public assets, site photo folders).
COPY . .

# The server listens on 4000 (see src/server.js). Document that here.
EXPOSE 4000

# Calibration data is written to /app/signatures.json. Mount a volume over it
# (see run command above) so your calibration survives container restarts —
# this is the Docker answer to the "data resets" problem from Render's free tier.

# Start the server.
CMD ["node", "src/server.js"]
