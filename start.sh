#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example."
  echo "Set GEMINI_API_KEY in .env for a live run, or leave GEMINI_FAKE=1 to run entirely against the local stub."
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo ""
echo "Backend:  http://localhost:3001"
echo "Frontend: http://localhost:5173"
echo ""

exec npm run dev
