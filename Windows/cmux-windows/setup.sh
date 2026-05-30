#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "============================================"
echo "  Setting up cmux Windows v0.1.0"
echo "============================================"
echo

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH."
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "pnpm not found. Installing pnpm via npm..."
    npm install -g pnpm
fi

cd "$SCRIPT_DIR"

echo
echo "[1/2] Installing workspace dependencies..."
echo "----------------------------------------"
pnpm install

echo
echo "[2/2] Typechecking cmux Windows..."
echo "----------------------------------------"
pnpm typecheck

echo
echo "============================================"
echo "  Setup complete!"
echo "  Run: ./run.bat on Windows or pnpm dev"
echo "============================================"
