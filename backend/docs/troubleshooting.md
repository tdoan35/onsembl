# Troubleshooting Guide

## Common Supabase Issues and Solutions

### Connection Issues

#### Error: DB_NOT_CONFIGURED
**Symptom:**
```
Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY
```

**Solution:**
1. Ensure environment variables are set:
```bash
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY
```

2. If missing, set them:
```bash
export SUPABASE_URL=http://localhost:54321
export SUPABASE_ANON_KEY=your-key-here
```

3. Or add to `.env` file:
```
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-key-here
```

#### Error: CONNECTION_FAILED
**Symptom:**
```
Failed to connect to database
```

**Solutions:**

**Local Supabase:**
1. Check if Supabase is running:
```bash
supabase status
```

2. If not running, start it:
```bash
supabase start
```

3. Check Docker is running:
```bash
docker ps
```

**Cloud Supabase:**
1. Verify URL is correct (should be https, not http)
2. Check network connectivity
3. Verify project is not paused (free tier pauses after inactivity)

#### Error: INVALID_SUPABASE_URL
**Symptom:**
```
Invalid Supabase URL format
```

**Solution:**
Ensure URL follows correct format:
- Local: `http://localhost:54321`
- Cloud: `https://[project-id].supabase.co`

Don't include trailing slashes or paths.

#### Error: AUTH_FAILED
**Symptom:**
```
Authentication failed
```

**Solutions:**
1. Verify anon key is correct
2. Check key hasn't been rotated
3. Ensure using anon key, not service key, for client connections

### Docker Issues

#### Docker Not Running
**Symptom:**
```
Cannot connect to Docker daemon
```

**Solution:**
1. Start Docker Desktop (macOS/Windows)
2. Or start Docker service (Linux):
```bash
sudo systemctl start docker
```

#### Port Already in Use
**Symptom:**
```
Error: bind: address already in use
```

**Solution:**
1. Find process using port:
```bash
# For port 54322 (PostgreSQL)
lsof -i :54322

# Kill the process
kill -9 <PID>
```

2. Or change Supabase ports in `supabase/config.toml`:
```toml
[api]
port = 54321

[db]
port = 54322

[studio]
port = 54323
```

### Migration Issues

#### Migration Failed
**Symptom:**
```
Error applying migration
```

**Solutions:**
1. Check migration syntax:
```bash
supabase db lint
```

2. Reset database (WARNING: Deletes all data):
```bash
supabase db reset
```

3. Check migration files in `supabase/migrations/`

#### Table Already Exists
**Symptom:**
```
Error: relation "agents" already exists
```

**Solution:**
1. Drop and recreate:
```bash
supabase db reset
```

2. Or modify migration to check existence:
```sql
CREATE TABLE IF NOT EXISTS agents (...);
```

### Performance Issues

#### Slow Queries
**Symptom:**
Database operations taking too long

**Solutions:**
1. Check indexes:
```sql
-- In Supabase Studio
SELECT * FROM pg_indexes WHERE tablename = 'agents';
```

2. Add missing indexes:
```sql
CREATE INDEX idx_agents_status ON agents(status);
```

3. Check connection pool settings

#### Connection Pool Exhausted
**Symptom:**
```
Error: remaining connection slots are reserved
```

**Solution:**
1. Increase pool size in Supabase dashboard
2. Check for connection leaks in code
3. Implement connection pooling

### Environment Detection Issues

#### Wrong Environment Detected
**Symptom:**
Server thinks it's in wrong environment

**Solution:**
Check environment variables:
```bash
# Should be unset for auto-detection
echo $NODE_ENV

# Or explicitly set
export NODE_ENV=development
```

#### Can't Connect After Environment Change
**Solution:**
1. Clear any cached connections
2. Restart the server
3. Verify new environment variables

### WebSocket Database Events

#### Not Receiving database:status Events
**Solutions:**
1. Check WebSocket connection is established
2. Verify dashboard is subscribed to events
3. Check health service is initialized

#### Incorrect Database Status
**Solution:**
Force a health check:
```bash
curl http://localhost:3010/api/system/health
```

### Testing Issues

#### Tests Can't Connect to Database
**Solution:**
1. Use separate test database:
```bash
export SUPABASE_URL=http://localhost:54321
export NODE_ENV=test
```

2. Or use in-memory mocks for unit tests

#### Test Data Persisting
**Solution:**
Clean database between tests:
```javascript
beforeEach(async () => {
  await supabase.from('agents').delete().neq('id', 0);
});
```

### Debugging Tips

#### Enable Debug Logging
```bash
export LOG_LEVEL=debug
npm run dev
```

#### Check Database Logs
```bash
# Local Supabase
supabase db logs

# Cloud Supabase
# Check dashboard under Logs section
```

#### Test Connection Manually
```bash
# Using curl
curl -X GET "http://localhost:54321/rest/v1/" \
  -H "apikey: your-anon-key" \
  -H "Authorization: Bearer your-anon-key"
```

#### Monitor Health Endpoint
```bash
# Watch health status
watch -n 1 'curl -s http://localhost:3010/health | json_pp'
```

### Recovery Procedures

#### Complete Reset
```bash
# Stop everything
supabase stop
npm run clean

# Reset database
supabase db reset

# Restart
supabase start
npm run dev
```

#### Backup and Restore
```bash
# Backup
supabase db dump > backup.sql

# Restore
psql postgresql://postgres:postgres@localhost:54322/postgres < backup.sql
```

## Getting Help

### Check Logs First
1. Server logs: Check console output
2. Database logs: `supabase db logs`
3. Docker logs: `docker logs <container>`

### Error Messages
Our error messages include:
- Error code
- Clear description
- Solution steps
- Documentation links

### Still Stuck?
1. Check [Supabase Discord](https://discord.supabase.com)
2. Review [Supabase Docs](https://supabase.com/docs)
3. Search [GitHub Issues](https://github.com/supabase/supabase/issues)

## Monitoring Checklist

Regular checks to prevent issues:

- [ ] Database connection: `/health`
- [ ] System health: `/api/system/health`
- [ ] WebSocket connections: Check dashboard
- [ ] Database size: Monitor in Supabase dashboard
- [ ] Error rate: Check logs for patterns
- [ ] Performance: Monitor query times
- [ ] Disk space: For local Supabase/Docker