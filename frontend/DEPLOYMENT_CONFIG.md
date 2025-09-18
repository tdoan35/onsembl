# Deployment Configuration Guide

## Overview
The frontend has been updated to support environment-based configuration for different deployment environments (development, staging, production).

## Environment Variables

### Required Variables
- `NEXT_PUBLIC_API_URL` - Backend API URL (required in production)
  - Development default: `http://localhost:3001`
  - Production example: `https://api.onsembl.ai`

### Optional Variables
- `NEXT_PUBLIC_ENV` - Environment name (development/staging/production)
- `NEXT_PUBLIC_WS_URL` - WebSocket URL (auto-derived from API_URL if not set)
- `NEXT_PUBLIC_API_TIMEOUT` - API timeout in milliseconds
- `NEXT_PUBLIC_DEBUG` - Enable debug mode (true/false)

## Configuration Files

### 1. `/frontend/src/services/config.ts`
Centralized configuration service that:
- Reads environment variables
- Provides type-safe configuration
- Validates production settings
- Auto-derives WebSocket URLs from API URLs

### 2. `/frontend/.env.example`
Template file with all available environment variables and example configurations.

### 3. `/frontend/.env.local`
Local development configuration (not committed to git).

## Deployment Instructions

### Local Development
```bash
# Copy example env file
cp .env.example .env.local

# Edit .env.local with your settings
NEXT_PUBLIC_API_URL=http://localhost:3001

# Start development server
npm run dev
```

### Production Deployment (Vercel)
1. Set environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_ENV=production`
   - `NEXT_PUBLIC_API_URL=https://api.onsembl.ai`

2. Deploy will automatically use these variables

### Production Deployment (Docker)
```dockerfile
# Set build args
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ENV=production

# Build with args
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.onsembl.ai \
  --build-arg NEXT_PUBLIC_ENV=production \
  -t onsembl-frontend .
```

### Fly.io Deployment
```toml
# fly.toml
[build.args]
  NEXT_PUBLIC_API_URL = "https://api.onsembl.ai"
  NEXT_PUBLIC_ENV = "production"
```

## Validation

### Development
- URLs can use localhost
- Extended timeouts for debugging
- Debug mode available

### Production
- Validates non-localhost URLs
- Warns if not using HTTPS/WSS
- Enforces required variables

## Testing Configuration

### Check Current Configuration
```bash
# Visit in browser
http://localhost:3000/api/config

# Or use curl
curl http://localhost:3000/api/config | jq .
```

### Test Production Build
```bash
NODE_ENV=production \
NEXT_PUBLIC_ENV=production \
NEXT_PUBLIC_API_URL=https://api.onsembl.ai \
npm run build
```

## Troubleshooting

### Issue: "API URL cannot use localhost in production"
**Solution**: Set `NEXT_PUBLIC_API_URL` to your production API domain

### Issue: WebSocket connection fails
**Solution**:
- Check `NEXT_PUBLIC_WS_URL` is set correctly
- Ensure WSS protocol for production
- Verify CORS settings on backend

### Issue: Environment variables not loading
**Solution**:
- Restart Next.js server after changing `.env.local`
- Ensure variables start with `NEXT_PUBLIC_`
- Check file is named `.env.local` not `.env`

## Security Notes

- Never commit `.env.local` to version control
- Use secure HTTPS/WSS in production
- Rotate API keys regularly
- Use environment-specific API endpoints