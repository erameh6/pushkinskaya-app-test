# services/sites-service/Dockerfile
FROM node:20-slim

WORKDIR /app

# Install dependencies first — this layer is cached unless package files change,
# so rebuilds are fast when you only edit source code.
COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 5001
ENV PORT=5001

CMD ["node", "src/server.js"]