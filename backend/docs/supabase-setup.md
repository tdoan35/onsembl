# Supabase Setup Guide

## Overview
Onsembl.ai uses Supabase for data persistence. This guide covers setting up Supabase for both local development and production environments.

## Prerequisites
- Node.js 20+ installed
- npm or yarn package manager
- Docker (for local development with Supabase CLI)

## Local Development Setup

### 1. Install Supabase CLI
```bash
# macOS
brew install supabase/tap/supabase

# Linux/WSL
brew install supabase/tap/supabase

# Or via npm
npm install -g supabase
```

### 2. Initialize Supabase Project
```bash
# From the backend directory
cd backend

# Initialize Supabase
supabase init

# Start local Supabase instance
supabase start
```

This will start:
- PostgreSQL database on port 54322
- Supabase Studio on http://localhost:54323
- API Gateway on http://localhost:54321

### 3. Get Local Connection Details
```bash
# Display connection details
supabase status

# You'll see output like:
# API URL: http://localhost:54321
# DB URL: postgresql://postgres:postgres@localhost:54322/postgres
# Studio URL: http://localhost:54323
# Anon key: eyJ...
# Service key: eyJ...
```

### 4. Configure Environment Variables
Create a `.env` file in the backend directory:
```bash
# Copy from example
cp .env.example .env

# Edit with your local Supabase credentials
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key-from-status
SUPABASE_SERVICE_KEY=your-service-key-from-status
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

### 5. Run Database Migrations
```bash
# Apply migrations
supabase db push

# Or if you have migration files
supabase migration up
```

## Production Setup (Supabase Cloud)

### 1. Create Supabase Project
1. Go to [app.supabase.com](https://app.supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - Project name: `onsembl-production`
   - Database password: (save this securely)
   - Region: Choose closest to your users

### 2. Get Production Credentials
1. Go to Settings → API
2. Copy:
   - Project URL (SUPABASE_URL)
   - Anon public key (SUPABASE_ANON_KEY)
   - Service role key (SUPABASE_SERVICE_KEY) - keep secret!

### 3. Configure Production Environment
Set these in your deployment platform (Fly.io, Vercel, etc):
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
```

## Database Schema Setup

### Automatic Setup
Run the setup script:
```bash
npm run setup:database
```

### Manual Setup
1. Connect to Supabase Studio
2. Run the SQL migrations in `supabase/migrations/` directory
3. Verify tables are created

## Verifying Connection

### Check Health Endpoint
```bash
# Local
curl http://localhost:3010/health

# Should return:
{
  "status": "ok",
  "database": {
    "connected": true,
    "type": "supabase",
    "message": "Connected to Supabase"
  }
}
```

### Check Detailed Health
```bash
curl http://localhost:3010/api/system/health

# Returns comprehensive health status including database details
```

## Common Issues

### Docker Not Running
```
Error: Cannot connect to Docker
Solution: Start Docker Desktop or Docker daemon
```

### Port Conflicts
```
Error: Port 54322 already in use
Solution: Stop other PostgreSQL instances or change port in supabase/config.toml
```

### Migration Failures
```
Error: Migration failed
Solution: Check supabase/migrations for syntax errors
Run: supabase db reset to start fresh (WARNING: deletes all data)
```

## Development Workflow

### Daily Development
```bash
# Start Supabase
supabase start

# Start backend server
npm run dev

# Stop Supabase when done
supabase stop
```

### Database Changes
```bash
# Create new migration
supabase migration new add_feature_x

# Edit the migration file in supabase/migrations/
# Apply migration
supabase db push
```

### Syncing with Production
```bash
# Pull production schema
supabase db pull

# Push local changes to production (careful!)
supabase db push --linked
```

## Environment Detection

The application automatically detects the environment:
- **Local Supabase**: URL contains `localhost` or `127.0.0.1`
- **Cloud Supabase**: URL contains `supabase.co`
- **Local PostgreSQL**: DATABASE_URL without Supabase URLs
- **None**: No database configured

## Security Best Practices

1. **Never commit `.env` files** - use `.env.example` as template
2. **Use service keys only on backend** - never expose to frontend
3. **Enable Row Level Security (RLS)** on all tables
4. **Use environment-specific keys** - different for dev/staging/prod
5. **Rotate keys regularly** in production

## Monitoring

### Database Status
- Health endpoint: `/health`
- System health: `/api/system/health`
- WebSocket events: `database:status` broadcasts

### Logs
Check logs for database connection issues:
```bash
# Local logs
npm run dev

# Production logs (Fly.io)
fly logs
```

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Troubleshooting Guide](./troubleshooting.md)

## Support

For issues specific to Onsembl.ai:
1. Check [troubleshooting guide](./troubleshooting.md)
2. Review error messages in logs
3. Verify environment variables
4. Test connection with health endpoints