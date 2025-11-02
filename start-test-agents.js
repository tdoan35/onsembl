#!/usr/bin/env node
/**
 * Start test agents with proper Supabase JWT authentication
 */

const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env file manually from backend
const envPath = path.join(__dirname, 'backend', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = dotenv.parse(envContent);

const JWT_SECRET = envVars.SUPABASE_JWT_SECRET;
const SUPABASE_URL = envVars.SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.SUPABASE_ANON_KEY;
const AGENT_WRAPPER_PATH = path.join(__dirname, 'agent-wrapper');
const CLI_PATH = path.join(AGENT_WRAPPER_PATH, 'dist', 'cli.js');

if (!JWT_SECRET) {
  console.error('Error: SUPABASE_JWT_SECRET not found in environment');
  process.exit(1);
}

if (!fs.existsSync(CLI_PATH)) {
  console.error(`Error: CLI not found at ${CLI_PATH}`);
  console.error('Please build agent-wrapper first: npm run build -w agent-wrapper');
  process.exit(1);
}

// Create a test JWT token (valid user with the Ty Doan user ID from browser)
const TEST_USER_ID = '7378612a-5c3c-4728-81fb-f573f45bd239'; // From browser console logs
const token = jwt.sign(
  {
    sub: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  },
  JWT_SECRET,
  { algorithm: 'HS256' }
);

console.log('Generated test JWT token');
console.log(`User ID: ${TEST_USER_ID}`);
console.log(`WebSocket URL: ws://localhost:8080/ws/agent`);
console.log('');

const agents = [];

function startAgent(name, agentId) {
  console.log(`Starting agent: ${name} (${agentId})`);

  const agent = spawn('node', [CLI_PATH, 'start', '--agent', 'mock'], {
    cwd: AGENT_WRAPPER_PATH,
    stdio: 'pipe',
    env: {
      ...process.env,
      ONSEMBL_AGENT_ID: agentId,
      ONSEMBL_AGENT_NAME: name,
      ONSEMBL_AUTH_TOKEN: token,
      ONSEMBL_SERVER_URL: 'ws://localhost:8080/ws/agent',
      LOG_LEVEL: 'info',
      NODE_ENV: 'development'
    }
  });

  // Pipe output
  agent.stdout.on('data', (data) => {
    console.log(`[${name}] ${data.toString().trim()}`);
  });

  agent.stderr.on('data', (data) => {
    console.error(`[${name}] ERROR: ${data.toString().trim()}`);
  });

  agent.on('error', (err) => {
    console.error(`Failed to start ${name}:`, err);
  });

  agent.on('exit', (code) => {
    console.log(`${name} exited with code ${code}`);
    agents.splice(agents.indexOf(agent), 1);
  });

  agents.push(agent);
  return agent;
}

// Start first agent
startAgent('test-command-agent', 'test-command-agent');

// Start second agent after a delay
setTimeout(() => {
  startAgent('test-mock-agent', 'test-mock-agent');
}, 2000);

// Handle termination
process.on('SIGINT', () => {
  console.log('\n\nTerminating agents...');
  agents.forEach(agent => agent.kill());
  setTimeout(() => process.exit(0), 1000);
});

console.log('Press Ctrl+C to stop agents\n');
