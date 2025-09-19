#!/bin/bash

echo "Testing Claude directly with agent wrapper (no shell script indirection)"
echo "========================================================================="
echo ""
echo "Running directly with npx tsx..."
echo ""

# Run directly without shell script indirection
exec npx tsx src/cli.ts start \
  --agent claude \
  --auth-type subscription \
  --interactive \
  --no-websocket