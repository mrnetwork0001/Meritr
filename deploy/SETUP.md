# Meritr — VPS setup

Four processes, three identities, one origin. The box never holds the deployer key and never
gets a build toolchain.

| unit | what it does | key it holds |
|---|---|---|
| `meritr-relayer` | ingests real Ethereum Aave activity into MeritrAttestor, forever | **zero roles** |
| `meritr-agent` | discovers, triages and restructures distressed loans | `RISK_AGENT_ROLE` only |
| `meritr-api` | FastAPI risk API on loopback | **none** |
| `meritr-web` | Next.js console on loopback | **none** |
| `caddy` | TLS, one origin, routes `/api` `/health` `/docs` to the API | — |

## Why the relayer matters

"Autonomous" is easy to claim. Run for a day, the relayer leaves a public trail of
`CreditFactAttested` events on Blockscout, minutes apart, built from real Ethereum credit
activity — under a key that holds **no roles at all**. `MeritrAttestor.ingest` has no
`onlyRole`; the proof is self-validating and the borrower credited is decoded from the proven
log. A roleless key being sufficient *is* the permissionlessness claim, demonstrated.

## 0. Decide the hostname first

`NEXT_PUBLIC_MERITR_API` is inlined into the frontend **at build time**. Point the DNS A record
at the VPS and settle the hostname before building anything. Get it wrong and visitors see the
console's "Risk API unavailable" panel printing local setup instructions — the worst possible
artifact to put in front of a reviewer.

## 1. Prepare the box

```bash
sudo adduser --system --group --home /opt/meritr meritr
sudo mkdir -p /opt/meritr/var /etc/meritr
sudo chown -R meritr:meritr /opt/meritr

# Node 20+, Python 3.11+, Caddy
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs python3-venv caddy rsync

sudo ufw default deny incoming && sudo ufw allow 22,80,443/tcp && sudo ufw enable
# and in /etc/ssh/sshd_config: PasswordAuthentication no
```

## 2. Secrets

Copy `deploy/env.example` into three root-owned files, fill in the keys, `chmod 600`:

```bash
sudo install -m 600 -o root -g root /dev/null /etc/meritr/relayer.env
sudo install -m 600 -o root -g root /dev/null /etc/meritr/agent.env
sudo install -m 600 -o root -g root /dev/null /etc/meritr/api.env
```

**Never put `PRIVATE_KEY` on this box.** It holds `DEFAULT_ADMIN_ROLE` and `PRICE_ROLE`: a
stolen copy could `pause()` the console a reviewer is opening, or crater the collateral mark.
`agents/config.py` deliberately does **not** fall back to it, so a typo'd variable name fails
loudly instead of silently loading admin authority.

## 3. Install units

```bash
sudo cp deploy/meritr-*.service /etc/systemd/system/
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # edit the hostname first
sudo systemctl daemon-reload
sudo systemctl enable --now meritr-api meritr-web meritr-agent meritr-relayer caddy
```

## 4. Deploy

```bash
MERITR_HOST=meritr.example.com MERITR_SSH=meritr@1.2.3.4 ./deploy/push.sh
```

## 5. Verify — from a phone on mobile data, not the laptop

The laptop may resolve stale DNS or hit a cached build.

```bash
curl https://<host>/health
ssh <host> 'journalctl -u meritr-agent -u meritr-relayer -f'
```

Watch for ten minutes. A silently dead daemon during judging inverts the entire point of
running one.

## Recovery

The demo tokens have an open mint, so anyone can drain the pool's liquidity and blank the
dashboard's figures. Probability is low, recovery is one idempotent command:

```bash
npx hardhat run scripts/setupTestnetMarket.js --network creditcoinTestnet
```

It derives the actor wallets deterministically from the deployer key, so re-running restores
the market rather than stranding funds.

## Key rotation

```bash
node -e "const w=require('ethers').Wallet.createRandom();console.log(w.address,w.privateKey)"
# grantRole(RISK_AGENT_ROLE, new) ; revokeRole(RISK_AGENT_ROLE, old)
sudo systemctl restart meritr-agent
```

Improvising this under pressure is how people brick their own demo.
