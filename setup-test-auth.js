#!/usr/bin/env node
/**
 * Setup test authentication credentials for testing
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Load JWT secret from backend .env
const backendEnvPath = path.join(__dirname, 'backend', '.env');
const envContent = fs.readFileSync(backendEnvPath, 'utf8');
const envVars = dotenv.parse(envContent);

const JWT_SECRET = envVars.SUPABASE_JWT_SECRET;
const TEST_USER_ID = '7378612a-5c3c-4728-81fb-f573f45bd239';

// Create a test JWT token
const token = jwt.sign(
  {
    sub: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
  },
  JWT_SECRET,
  { algorithm: 'HS256' }
);

console.log('Generated test token:', token.substring(0, 50) + '...');

// Save to credential store location (simulate .onsembl or ~/.onsembl directory)
const credentialDir = path.join(os.homedir(), '.onsembl');
const credentialFile = path.join(credentialDir, 'credentials.json');

try {
  if (!fs.existsSync(credentialDir)) {
    fs.mkdirSync(credentialDir, { recursive: true });
    console.log('Created credential directory:', credentialDir);
  }

  const credentials = {
    access_token: token,
    refresh_token: 'test-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user_id: TEST_USER_ID,
    scopes: ['authenticated'],
    server_url: 'ws://localhost:8080'
  };

  // Create unencrypted version for reference
  fs.writeFileSync(credentialFile, JSON.stringify(credentials, null, 2));
  console.log('Saved unencrypted test credentials to:', credentialFile);

  // Also try to create the encrypted version that the CLI expects
  const crypto = require('crypto');
  const keyPath = path.join(credentialDir, '.key');
  const encPath = path.join(credentialDir, 'credentials.enc');

  // Generate encryption key (random hex string)
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, key, { mode: 0o600 });

  // Encrypt credentials using the same method as credential-store.ts
  const iv = crypto.randomBytes(16);
  // Derive a proper 32-byte key from the hex string by hashing it
  const keyBuffer = crypto.createHash('sha256').update(key).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  fs.writeFileSync(encPath, iv.toString('hex') + ':' + encrypted, { mode: 0o600 });

  console.log('Also saved encrypted credentials to:', encPath);
  console.log('\nCredentials:');
  console.log('- User ID:', TEST_USER_ID);
  console.log('- Server URL: ws://localhost:8080');
  console.log('- Expires in: 24 hours');
  console.log('\nNow you can start agents with: npm run dev -w agent-wrapper');

} catch (error) {
  console.error('Failed to save credentials:', error);
  process.exit(1);
}
