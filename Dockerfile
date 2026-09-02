FROM node:20-alpine

# better-sqlite3 trae binarios precompilados; python3/make/g++ cubren el fallback a compilación.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/estudio.db

EXPOSE 3000
CMD ["node", "server/index.js"]
