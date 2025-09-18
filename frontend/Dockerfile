# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY packages/ ./packages/

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./frontend/

# Build the application
WORKDIR /app/frontend
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/frontend/package.json ./frontend/
COPY --from=builder /app/packages/ ./packages/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built application
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public

# Create .next/cache directory and set permissions
RUN mkdir -p /app/frontend/.next/cache && \
    chown -R nodejs:nodejs /app/frontend

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start the application with dumb-init for proper signal handling
WORKDIR /app/frontend
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]