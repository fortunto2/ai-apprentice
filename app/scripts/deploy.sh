#!/usr/bin/env bash
# Push the three secrets from .env.local to Vercel production and deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a
V="pnpm dlx vercel@latest"
for k in GEMINI_API_KEY ELEVENLABS_API_KEY ELEVENLABS_AGENT_ID; do
  printf '%s' "${!k}" | $V env add "$k" production --force 2>&1 | tail -1 || true
done
$V --prod --yes 2>&1 | tail -4
