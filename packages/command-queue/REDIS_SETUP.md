# Redis Setup for Command Queue

The command queue requires Redis for BullMQ. You have two options:

## Option 1: Use Upstash (Recommended for Production)

1. Sign up for a free account at [Upstash](https://console.upstash.com/)
2. Create a new Redis database
3. Copy your credentials from the Upstash dashboard
4. Update your `.env` file with:

```env
REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_REGION.upstash.io:6379
```

Or use individual settings:

```env
REDIS_HOST=YOUR_REGION.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_PASSWORD
REDIS_TLS=true
```

## Option 2: Use Local Redis (Development Only)

1. Install Redis locally:
   - macOS: `brew install redis`
   - Ubuntu: `sudo apt-get install redis-server`
   - Windows: Use WSL or Docker

2. Start Redis:
   - macOS: `brew services start redis`
   - Ubuntu: `sudo systemctl start redis`

3. Update your `.env` file with:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Testing the Connection

After setting up Redis, test your connection:

```bash
cd packages/command-queue
npm run build
node test-redis.js
```

If successful, you'll see:
- ✅ All Redis tests passed successfully!
- Redis connection is properly configured and working.

## Troubleshooting

- **Connection refused**: Make sure Redis is running
- **Authentication failed**: Check your password in `.env`
- **TLS error**: For Upstash, make sure you're using `rediss://` (with double 's')
- **Timeout**: Check firewall settings or network connectivity