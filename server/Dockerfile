FROM node:20-alpine AS builder

WORKDIR /app

# Install all dependencies (including dev for TypeScript)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install Python and required packages for sync script
RUN apk add --no-cache python3 py3-pip py3-psycopg2 py3-requests

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3003

CMD ["node", "dist/index.js"]
