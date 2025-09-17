#!/usr/bin/env node

/**
 * Generate a development JWT token for testing WebSocket connections
 */

import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
config({ path: join(__dirname, '../.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key-change-in-production';

// Generate tokens for different user types
const users = {
  dashboard: {
    sub: 'dev-dashboard-user',
    email: 'dashboard@dev.local',
    role: 'admin',
    type: 'dashboard'
  },
  agent: {
    sub: 'dev-agent-001',
    email: 'agent@dev.local',
    role: 'agent',
    type: 'agent'
  }
};

function generateToken(userData) {
  const payload = {
    ...userData,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };

  return jwt.sign(payload, JWT_SECRET);
}

// Parse command line arguments
const userType = process.argv[2] || 'dashboard';

if (!users[userType]) {
  console.error(`Unknown user type: ${userType}`);
  console.log('Available types: dashboard, agent');
  process.exit(1);
}

const token = generateToken(users[userType]);

console.log('\n========================================');
console.log(`Development ${userType.toUpperCase()} Token`);
console.log('========================================');
console.log('\nToken (valid for 24 hours):');
console.log(token);
console.log('\n----------------------------------------');
console.log('User Details:');
console.log(JSON.stringify(users[userType], null, 2));
console.log('\n----------------------------------------');
console.log('Usage:');
console.log(`export TOKEN="${token}"`);
console.log('\nOr in your test script:');
console.log(`const token = '${token}';`);
console.log('\n========================================\n');