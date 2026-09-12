#!/usr/bin/env bash
# Ship Meritr to the VPS.
#
#   MERITR_HOST=meritr.example.com MERITR_SSH=meritr@1.2.3.4 ./deploy/push.sh
#
# Deploys by rsync rather than `git clone`, deliberately:
#   - agents/config.py resolves every ABI from artifacts/, which is gitignored, so a clean
#     clone kills the agent and the API at construction time.
#   - .next is gitignored too, and a small VPS will OOM running `next build`.
#   - Building on the laptop means the box needs no Hardhat and therefore never sees
#     PRIVATE_KEY, which hardhat.config.js would otherwise read.
set -euo pipefail

: "${MERITR_HOST:?set MERITR_HOST to the public hostname, e.g. meritr.example.com}"
: "${MERITR_SSH:?set MERITR_SSH to user@host for ssh/rsync}"
REMOTE_DIR="${MERITR_REMOTE_DIR:-/opt/meritr}"

echo "==> Building the frontend against https://${MERITR_HOST}"
# NEXT_PUBLIC_MERITR_API is inlined at build time. Changing the hostname later is a rebuild,
# not a restart - get it right here or judges see the "Risk API unavailable" panel.
NEXT_PUBLIC_MERITR_API="https://${MERITR_HOST}" npx next build

echo "==> Compiling contracts (for the ABIs the agent and API load at startup)"
npx hardhat compile

echo "==> Syncing to ${MERITR_SSH}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude .next-build \
  --exclude var \
  --exclude cache \
  ./ "${MERITR_SSH}:${REMOTE_DIR}/"

echo "==> Installing runtime dependencies on the remote"
ssh "${MERITR_SSH}" bash -euo pipefail <<REMOTE
cd ${REMOTE_DIR}
# --omit=dev leaves out Hardhat, which is a devDependency and has no business here.
npm ci --omit=dev
python3 -m venv .venv 2>/dev/null || true
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
mkdir -p var
REMOTE

echo "==> Restarting services"
ssh "${MERITR_SSH}" 'sudo systemctl restart meritr-api meritr-web meritr-agent meritr-relayer'

echo "==> Health check"
sleep 5
curl -fsS "https://${MERITR_HOST}/health" | head -c 300 || echo "  (health check failed - check journalctl)"
echo
echo "Done. Watch the daemons with:"
echo "  ssh ${MERITR_SSH} 'journalctl -u meritr-agent -u meritr-relayer -f'"
