# Fly.io Deployment Guide for Onsembl.ai Backend

This guide covers deploying the Onsembl.ai Control Center backend (Fastify server) to Fly.io, including Redis/BullMQ setup with Upstash and Supabase integration.

## Prerequisites

1. **Fly.io Account**: Sign up at [fly.io](https://fly.io)
2. **Fly CLI**: Install the [Fly CLI](https://fly.io/docs/getting-started/installing-flyctl/)
3. **Docker**: Ensure Docker is installed and running
4. **Upstash Redis**: Set up a Redis instance at [console.upstash.com](https://console.upstash.com)
5. **Supabase Project**: Create a project at [app.supabase.com](https://app.supabase.com)

## Initial Setup

### 1. Install and Authenticate with Fly CLI

```bash
# Install Fly CLI (macOS)
brew install flyctl

# Install Fly CLI (Linux/Windows)
curl -L https://fly.io/install.sh | sh

# Authenticate
flyctl auth login
```

### 2. Prepare Your Backend Application

Navigate to your backend directory:

```bash
cd backend/
```

Ensure your `package.json` has the correct start script:

```json
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 3. Create a Dockerfile

Create `backend/Dockerfile`:

```dockerfile
# Use Node.js 20 Alpine image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY packages/ ./packages/

# Build TypeScript
RUN npm run build

# Remove dev dependencies and source files
RUN npm prune --production && \
    rm -rf src/ packages/ tsconfig.json

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S onsembl -u 1001

# Change ownership of app directory
RUN chown -R onsembl:nodejs /app
USER onsembl

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
CMD ["npm", "start"]
```

### 4. Create .dockerignore

Create `backend/.dockerignore`:

```dockerignore
node_modules
dist
.env
.env.*
*.log
.git
.gitignore
README.md
Dockerfile
.dockerignore
coverage/
.nyc_output
.cache
```

## Fly.io Application Setup

### 1. Initialize Fly Application

```bash
# Initialize Fly app (run from backend/ directory)
flyctl launch --no-deploy

# This creates a fly.toml file
```

### 2. Configure fly.toml

Edit the generated `fly.toml` file:

```toml
# fly.toml app configuration file
app = "onsembl-backend"
primary_region = "sjc"  # Choose region closest to your users

[build]

[env]
  NODE_ENV = "production"
  BACKEND_PORT = "3001"
  LOG_LEVEL = "info"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/health"

[vm]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 1024

[[vm.env]]
  PORT = "3001"

[metrics]
  port = 9091
  path = "/metrics"

[[services]]
  protocol = "tcp"
  internal_port = 3001
  processes = ["app"]

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 1000
    soft_limit = 200

# WebSocket service for real-time communication
[[services]]
  protocol = "tcp"
  internal_port = 3002
  processes = ["app"]

  [[services.ports]]
    port = 3002
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 500
    soft_limit = 100
```

### 3. Set Environment Variables

Configure production environment variables as secrets:

```bash
# Core application settings
flyctl secrets set NODE_ENV=production
flyctl secrets set LOG_LEVEL=info
flyctl secrets set BACKEND_PORT=3001
flyctl secrets set WS_PORT=3002

# Supabase configuration
flyctl secrets set SUPABASE_URL=https://your-project-id.supabase.co
flyctl secrets set SUPABASE_ANON_KEY=your-supabase-anon-key
flyctl secrets set SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Redis/Upstash configuration
flyctl secrets set REDIS_URL=rediss://default:your-password@your-region.upstash.io:6380
flyctl secrets set REDIS_HOST=your-region.upstash.io
flyctl secrets set REDIS_PORT=6380
flyctl secrets set REDIS_PASSWORD=your-upstash-password
flyctl secrets set REDIS_TLS=true

# JWT configuration (generate strong secrets)
flyctl secrets set JWT_SECRET=$(openssl rand -base64 32)
flyctl secrets set JWT_REFRESH_SECRET=$(openssl rand -base64 32)
flyctl secrets set JWT_EXPIRES_IN=1h
flyctl secrets set JWT_REFRESH_EXPIRES_IN=7d

# AI Agent API Keys
flyctl secrets set ANTHROPIC_API_KEY=sk-ant-api03-your-key
flyctl secrets set OPENAI_API_KEY=sk-your-openai-key
flyctl secrets set GOOGLE_AI_API_KEY=your-google-ai-key
flyctl secrets set GOOGLE_PROJECT_ID=your-google-cloud-project

# Queue configuration
flyctl secrets set QUEUE_CONCURRENCY=5
flyctl secrets set QUEUE_MAX_RETRIES=3
flyctl secrets set COMMAND_QUEUE_NAME=agent-commands
flyctl secrets set TRACE_QUEUE_NAME=llm-traces

# CORS configuration
flyctl secrets set CORS_ORIGINS=https://your-frontend-domain.vercel.app,https://app.onsembl.ai

# Rate limiting
flyctl secrets set RATE_LIMIT_WINDOW_MS=60000
flyctl secrets set RATE_LIMIT_MAX_REQUESTS=100

# Agent configuration
flyctl secrets set MAX_CONCURRENT_AGENTS=10
flyctl secrets set AGENT_RESPONSE_TIMEOUT=30000
flyctl secrets set AGENT_COMMAND_TIMEOUT=300000

# WebSocket configuration
flyctl secrets set WS_MAX_CONNECTIONS=100
flyctl secrets set WS_HEARTBEAT_INTERVAL=30000
flyctl secrets set WS_CONNECTION_TIMEOUT=60000
flyctl secrets set WS_MAX_MESSAGE_SIZE=1048576
```

## Redis Setup with Upstash

### 1. Create Upstash Redis Instance

1. Go to [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database
3. Choose a region close to your Fly.io deployment
4. Copy the connection details

### 2. Configure Redis Connection

The Redis URL should be in the format:
```
rediss://default:your-password@your-region.upstash.io:6380
```

Verify connection by testing locally:

```javascript
// test-redis.js
const Redis = require('redis');

const client = Redis.createClient({
  url: process.env.REDIS_URL,
  socket: {
    tls: true,
    rejectUnauthorized: false
  }
});

client.connect().then(() => {
  console.log('✅ Redis connected successfully');
  client.quit();
}).catch(err => {
  console.error('❌ Redis connection failed:', err);
});
```

## Supabase Integration

### 1. Database Setup

Ensure your Supabase database has the required tables. Run migrations:

```bash
# From your project root
npx supabase db push
```

### 2. Configure Database Connection

Set the database URL for direct PostgreSQL connections (optional):

```bash
flyctl secrets set DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
```

### 3. Row Level Security (RLS)

Ensure RLS policies are configured for production:

```sql
-- Enable RLS on all tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
-- ... for all other tables

-- Example policy for agents table
CREATE POLICY "Authenticated users can view agents" ON agents
  FOR SELECT USING (auth.role() = 'authenticated');
```

## Deployment Process

### 1. Build and Deploy

```bash
# Deploy to Fly.io
flyctl deploy

# Check deployment status
flyctl status

# View logs
flyctl logs
```

### 2. Verify Deployment

Check the health endpoint:

```bash
curl https://your-app-name.fly.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00Z",
  "version": "0.1.0",
  "services": {
    "database": "connected",
    "redis": "connected",
    "websocket": "active"
  }
}
```

### 3. Test WebSocket Connection

```bash
# Test WebSocket endpoint
wscat -c wss://your-app-name.fly.dev/ws

# Should receive connection acknowledgment
```

## Scaling and Performance

### 1. Horizontal Scaling

Scale your application based on load:

```bash
# Scale to multiple machines
flyctl scale count 3

# Scale to different regions
flyctl scale count 2 --region sjc
flyctl scale count 1 --region dfw
```

### 2. Vertical Scaling

Increase resources per machine:

```bash
# Scale memory and CPU
flyctl scale memory 2048
flyctl scale vm shared-cpu-2x
```

### 3. Auto Scaling Configuration

Update `fly.toml` for auto-scaling:

```toml
[vm]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 1024

[http_service]
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  max_machines_running = 5

  [[http_service.concurrency]]
    type = "requests"
    hard_limit = 250
    soft_limit = 200
```

## Monitoring and Logging

### 1. Log Management

View and search logs:

```bash
# View live logs
flyctl logs

# Filter logs by level
flyctl logs --level error

# Search logs
flyctl logs | grep "ERROR"
```

### 2. Health Monitoring

Set up health checks in your application:

```javascript
// src/routes/health.ts
export async function healthHandler() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    services: {}
  };

  try {
    // Check database connection
    await supabase.from('agents').select('count').limit(1);
    health.services.database = 'connected';
  } catch (error) {
    health.services.database = 'error';
    health.status = 'unhealthy';
  }

  try {
    // Check Redis connection
    await redis.ping();
    health.services.redis = 'connected';
  } catch (error) {
    health.services.redis = 'error';
    health.status = 'unhealthy';
  }

  return health;
}
```

### 3. Performance Monitoring

Add performance metrics:

```javascript
// src/plugins/metrics.ts
import client from 'prom-client';

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

const wsConnections = new client.Gauge({
  name: 'websocket_connections_total',
  help: 'Total number of WebSocket connections'
});

export { httpRequestDuration, wsConnections };
```

## Security Configuration

### 1. Network Security

Configure IP allowlists if needed:

```bash
# Allow specific IP ranges (optional)
flyctl ips allocate-v4 --region sjc
flyctl ips allocate-v6 --region sjc
```

### 2. Certificate Management

Fly.io automatically handles SSL certificates, but you can configure custom domains:

```bash
# Add custom domain
flyctl certs add api.onsembl.ai

# Check certificate status
flyctl certs show api.onsembl.ai
```

### 3. Environment Security

Secure your secrets:

```bash
# Rotate JWT secrets periodically
flyctl secrets set JWT_SECRET=$(openssl rand -base64 32)

# List all secrets (names only)
flyctl secrets list
```

## Troubleshooting

### Common Issues

1. **Memory Issues**
   ```bash
   # Check memory usage
   flyctl status

   # Scale memory if needed
   flyctl scale memory 2048
   ```

2. **Redis Connection Errors**
   ```bash
   # Test Redis connection
   flyctl ssh console
   node -e "require('redis').createClient({url: process.env.REDIS_URL}).connect().then(() => console.log('OK'))"
   ```

3. **Database Connection Issues**
   ```bash
   # Check Supabase connection
   flyctl ssh console
   curl -H "apikey: $SUPABASE_ANON_KEY" "$SUPABASE_URL/rest/v1/agents?select=count"
   ```

4. **WebSocket Issues**
   ```bash
   # Check WebSocket port
   flyctl logs | grep "WebSocket"

   # Test connection
   wscat -c wss://your-app.fly.dev/ws
   ```

### Debugging

Access your application for debugging:

```bash
# SSH into the machine
flyctl ssh console

# Check running processes
ps aux

# Check application logs
tail -f /var/log/app.log

# Check environment variables
env | grep -E "(REDIS|SUPABASE|JWT)"
```

## Backup and Recovery

### 1. Database Backups

Supabase handles database backups automatically, but you can create manual backups:

```bash
# Create manual backup
flyctl ssh console
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### 2. Configuration Backup

Backup your Fly.io configuration:

```bash
# Export current configuration
flyctl config save

# Backup secrets list
flyctl secrets list > secrets-backup.txt
```

### 3. Disaster Recovery

Document your recovery process:

1. Restore Fly.io app from configuration
2. Set environment variables from backup
3. Verify Supabase and Redis connections
4. Test health endpoints
5. Update DNS if using custom domains

## Cost Optimization

### 1. Machine Optimization

Choose appropriate machine sizes:

```bash
# For development/staging
flyctl scale vm shared-cpu-1x --memory 512

# For production
flyctl scale vm shared-cpu-2x --memory 1024
```

### 2. Auto-Stop Configuration

Configure machines to stop when idle:

```toml
[http_service]
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0  # For development
```

### 3. Resource Monitoring

Monitor costs and usage:

```bash
# Check current usage
flyctl dashboard

# Monitor resource consumption
flyctl logs | grep -E "(memory|cpu)"
```

## Production Checklist

Before going live, ensure:

- ✅ All environment variables are set
- ✅ Redis connection is working
- ✅ Supabase database is migrated
- ✅ Health checks are passing
- ✅ SSL certificates are valid
- ✅ CORS is configured correctly
- ✅ Rate limiting is enabled
- ✅ Logging is configured
- ✅ Monitoring is set up
- ✅ Backup procedures are documented
- ✅ Load testing is completed

## Next Steps

After successful deployment:

1. Set up monitoring dashboards
2. Configure alerting for critical errors
3. Implement log aggregation
4. Set up CI/CD pipeline for automated deployments
5. Configure staging environment
6. Document operational procedures

For frontend deployment, see the [Vercel Deployment Guide](./deployment-vercel.md).