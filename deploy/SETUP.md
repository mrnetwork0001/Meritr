# Meritr - VPS setup

Four processes, three identities, one origin. The box never holds the deployer key and never
gets a build toolchain.

| unit | what it does | key it holds |
|---|---|---|
| `meritr-relayer` | ingests real Ethereum Aave activity into MeritrAttestor, forever | **zero roles** |
| `meritr-agent` | discovers, triages and restructures distressed loans | `RISK_AGENT_ROLE` only |
| `meritr-api` | FastAPI risk API on loopback | **none** |
| `meritr-web` | Next.js console on loopback | **none** |
| existing proxy | TLS and one origin; routes `/api` and `/health` to the API, everything else to the console | - |

## Why the relayer matters

"Autonomous" is easy to claim. Run for a day, the relayer leaves a public trail of
`CreditFactAttested` events on Blockscout, minutes apart, built from real Ethereum credit
activity - under a key that holds **no roles at all**. `MeritrAttestor.ingest` has no
`onlyRole`; the proof is self-validating and the borrower credited is decoded from the proven
log. A roleless key being sufficient *is* the permissionlessness claim, demonstrated.

## 0. Decide the hostname first

`NEXT_PUBLIC_MERITR_API` is inlined into the frontend **at build time**. Point the DNS A record
at the VPS and settle the hostname before building anything. Get it wrong and visitors see the
console's "Risk API unavailable" panel printing local setup instructions - the worst possible
artifact to put in front of a reviewer.

## 1. Prepare the box

> **This box runs other applications.** Every command below is additive. Nothing here
> replaces a config file, upgrades a shared runtime, or restarts a service that is not
> Meritr's. Read the warnings - two of the obvious commands will take other sites offline.

**Survey first. Do not install anything until you have read the output.**

```bash
ss -tlnp | awk 'NR==1||/LISTEN/'          # which ports are already taken
systemctl is-active caddy nginx apache2    # which proxy already owns :80 and :443
docker ps --format '{{.Names}}\t{{.Ports}}'
node -v; python3 -V                        # what runtimes are already here
```

Create the service account and directories - additive, touches nothing else:

```bash
sudo adduser --system --group --home /opt/meritr meritr
sudo mkdir -p /opt/meritr/var /etc/meritr
sudo chown -R meritr:meritr /opt/meritr
sudo chmod 750 /etc/meritr
```

Runtimes, **only if missing**:

```bash
node -v      # need 20+
python3 -V   # need 3.11+
```

> **Do not run the NodeSource installer on a shared box.** `curl …/setup_20.x | sudo bash`
> replaces the system Node package and every other Node application on this machine restarts
> against the new major version. If Node is already 20+, install nothing. If it is older,
> install Meritr's Node under `/opt/meritr` with `nvm` or a tarball and point
> `meritr-web.service` at that binary, leaving the system Node untouched.

> **Do not enable a firewall you did not already have.**
> `ufw allow 22,80,443/tcp && ufw enable` sets the default policy to deny, which silently
> cuts every other application listening on any other port. If `ufw status` says inactive,
> leave it inactive. If it is already active, add nothing - Meritr listens only on loopback
> and needs no new rule.

> **Do not install Caddy if nginx is already running,** and vice versa. Both bind :80 and
> :443; the second one to start simply fails. Use whichever proxy the box already has - a
> Caddy drop-in is in `meritr.caddy`, and the equivalent nginx block is in step 3.

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

Meritr's own units are new filenames, so they cannot collide with anything already installed:

```bash
sudo cp deploy/meritr-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now meritr-api meritr-web meritr-agent meritr-relayer
```

Confirm Meritr took the ports it expected and nothing else moved:

```bash
ss -tlnp | grep -E '127.0.0.1:(8787|3787)'
```

Both are loopback-only. If either port is already in use by a neighbour, override it in
`/etc/meritr/api.env` (`MERITR_API_PORT=`) or `/etc/meritr/web.env` (`MERITR_WEB_PORT=`)
and update the proxy block to match - do not move the neighbour.

### Then route one hostname to it, using the proxy this box already runs

**If it already runs Caddy** - add a drop-in, never replace the main Caddyfile:

```bash
sudo mkdir -p /etc/caddy/Caddyfile.d
sudo install -m 644 deploy/meritr.caddy /etc/caddy/Caddyfile.d/meritr.caddy
sudo sed -i "s/MERITR_HOSTNAME/$MERITR_HOST/" /etc/caddy/Caddyfile.d/meritr.caddy
grep -q 'Caddyfile.d' /etc/caddy/Caddyfile || \
  echo 'import /etc/caddy/Caddyfile.d/*.caddy' | sudo tee -a /etc/caddy/Caddyfile

sudo caddy validate --config /etc/caddy/Caddyfile    # MUST pass before touching the service
sudo systemctl reload caddy                           # reload, never restart
```

`reload` swaps config without dropping connections, so the other sites keep serving.
`restart` would briefly 502 every one of them.

**If it already runs nginx** - add a site, and do not install Caddy:

```nginx
# /etc/nginx/sites-available/meritr  -> symlink into sites-enabled
server {
    server_name MERITR_HOSTNAME;
    location /api/   { proxy_pass http://127.0.0.1:8787; }
    location /health { proxy_pass http://127.0.0.1:8787; }
    location / {
        proxy_pass http://127.0.0.1:3787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx    # -t first, reload not restart
sudo certbot --nginx -d "$MERITR_HOST"          # TLS, leaves other server blocks alone
```

### On hostnames

Let's Encrypt will not issue a certificate for a bare IP address. With no domain to hand,
a wildcard-DNS hostname resolves to the IP and does get a real certificate:

```
38.49.216.120.sslip.io
```

Settle this before building - `NEXT_PUBLIC_MERITR_API` is inlined at build time.

## 4. Deploy

```bash
MERITR_HOST=meritr.example.com MERITR_SSH=meritr@1.2.3.4 ./deploy/push.sh
```

## 5. Verify - from a phone on mobile data, not the laptop

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
