#!/bin/bash

echo "=== Claude CLI Diagnostic Test ==="
echo ""

echo "1. Checking if Claude is installed:"
which claude || echo "Claude not found in PATH"
echo ""

echo "2. Checking Claude version:"
claude --version 2>&1 || echo "Failed with exit code: $?"
echo ""

echo "3. Checking Claude login status:"
claude status 2>&1 || echo "Failed with exit code: $?"
echo ""

echo "4. Environment PATH:"
echo "$PATH"
echo ""

echo "5. Testing Claude in non-interactive mode:"
echo "What is 2+2?" | claude 2>&1 | head -20
echo "Exit code: $?"
echo ""

echo "6. Which shell:"
echo "$SHELL"
echo ""