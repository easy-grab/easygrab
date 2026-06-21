# Easy Grab Deployment

This guide covers local testing, Vercel frontend hosting, custom domain setup for `easygrab.fun`, and the encrypted history API.

## Local Testing

Create `.env` from `.env.example`.

```bash
VITE_PUBLIC_APP_URL=http://127.0.0.1:5173
VITE_API_URL=http://127.0.0.1:8787
VITE_MAINNET_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
VITE_DEVNET_RPC_URL=https://api.devnet.solana.com
HOST=127.0.0.1
PORT=8787
ALLOWED_ORIGIN=http://127.0.0.1:5173
MAX_BODY_BYTES=1000000
```

Install and run:

```bash
npm install
npm run api
npm run dev
```

Open:

```txt
http://127.0.0.1:5173/
```

After editing `.env`, restart `npm run dev`. Vite only reads env values at server start.

## Local Browser Checks

1. Connect wallet.
2. Confirm the top wallet balance card shows a balance with up to four decimals.
3. Confirm `SOL per claim` starts at `0.01`.
4. Confirm the batch preview shows no Easy Grab service fee.
5. Generate a devnet batch.
6. Confirm encrypted history is saved before funding.
7. Fund the batch.
8. Open a claim link.
9. Claim with wallet or paste a Solana address.
10. Confirm transaction links open on Solscan.

## Vercel Frontend

Import the GitHub repository into Vercel:

```txt
https://github.com/easy-grab/easygrab
```

Use these build settings:

```txt
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm ci
```

Set these Vercel environment variables:

```bash
VITE_PUBLIC_APP_URL=https://easygrab.fun
VITE_API_URL=https://YOUR_API_DOMAIN
VITE_MAINNET_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
VITE_DEVNET_RPC_URL=https://api.devnet.solana.com
```

`VITE_MAINNET_RPC_URL` is public in the browser build. Do not put wallet private keys, seed phrases, admin secrets, or claim secrets in Vite env vars.

## Custom Domain

In Vercel:

1. Open the Easy Grab project.
2. Go to `Settings` -> `Domains`.
3. Add `easygrab.fun`.
4. Add `www.easygrab.fun` if you want the www version too.
5. Follow the DNS values Vercel shows.

Typical DNS setup:

```txt
easygrab.fun       A      76.76.21.21
www.easygrab.fun   CNAME  cname.vercel-dns.com
```

Wait for Vercel to show the domain as valid. DNS propagation can take minutes to hours.

## Encrypted History API

The current API is a Node server that writes encrypted batch records to `data/encrypted-batches.json`.

For local testing:

```bash
npm run api
```

For production, run the API on a server that has persistent storage, such as a VPS, Railway, Fly.io, Render, or your own 24/7 server computer behind HTTPS.

Do not deploy the current file-backed API as a plain Vercel serverless function unless it is adapted to persistent storage such as Vercel KV, Postgres, Supabase, or another database. Serverless local files are not reliable persistent storage.

Recommended production API env:

```bash
HOST=127.0.0.1
PORT=8787
ALLOWED_ORIGIN=https://easygrab.fun,https://www.easygrab.fun
MAX_BODY_BYTES=1000000
```

Use `HOST=127.0.0.1` when the API runs behind Nginx, Caddy, Cloudflare Tunnel, or another HTTPS reverse proxy. Use `HOST=0.0.0.0` only when the machine firewall and reverse proxy rules are already locked down.

The API must be reachable over HTTPS from the browser. A typical setup is:

```txt
https://api.easygrab.fun/api/*  ->  http://127.0.0.1:8787/api/*
```

Backup requirement:

- Back up `data/encrypted-batches.json` automatically.
- Keep at least one off-machine backup copy.
- Test restore before mainnet launch.
- Monitor API disk space and process uptime.

The browser blocks mainnet funding until the encrypted draft history is saved. After funding, status updates use the same encrypted API and also keep a local retry queue if the network briefly fails.

## Production Checklist

- `easygrab.fun` serves the Vercel frontend over HTTPS.
- `VITE_PUBLIC_APP_URL` is set to `https://easygrab.fun`.
- `VITE_API_URL` points to an HTTPS API endpoint.
- The encrypted history API is online before mainnet funding.
- The encrypted history API has persistent storage and automatic backups.
- `ALLOWED_ORIGIN` on the API includes only the production frontend origins.
- `VITE_MAINNET_RPC_URL` uses a dedicated RPC provider.
- GitHub Actions CI passes.
- CodeQL is enabled.
- Dependabot is enabled.
- README, SECURITY, THREAT_MODEL, and TRANSPARENCY disclose:
  - minimum claim size: `0.01 SOL`
  - Easy Grab service fee: `0`
  - Solana network fees still apply

## Mainnet Smoke Test

Run this after deployment and before public promotion:

1. Open `https://easygrab.fun`.
2. Confirm the site is on `Mainnet`.
3. Connect a wallet with a small amount of SOL.
4. Create `1` claim with `0.01 SOL`.
5. Confirm the app shows the reward, no Easy Grab service fee, and the required total.
6. Generate the claim link.
7. Confirm encrypted server history appears in the saved batch list.
8. Fund the batch.
9. Open the claim link in a separate browser profile or private window.
10. Claim with a wallet, then repeat a separate test with pasted address receive mode.
11. Confirm each transaction opens on Solscan.
12. Return to the creator wallet and confirm the batch item shows the claimed link as disabled.
