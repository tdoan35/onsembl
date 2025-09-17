#!/bin/bash

# Fix process.env access to use bracket notation
echo "Fixing process.env access patterns..."

# Find and replace process.env.VARIABLE with process.env['VARIABLE']
find src -name "*.ts" -type f -exec sed -i '' -E "s/process\.env\.([A-Z_][A-Z0-9_]*)/process.env['\1']/g" {} \;

echo "Fixed process.env access patterns in all TypeScript files"