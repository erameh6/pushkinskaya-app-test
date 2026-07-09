# services/identify-service/Dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

# signatures.json is written under /app/data — this gets a volume mounted
# over it later so calibration survives container restarts.
RUN mkdir -p /app/data

EXPOSE 5002
ENV PORT=5002
ENV SIG_FILE=/app/data/signatures.json

CMD ["node", "src/server.js"]