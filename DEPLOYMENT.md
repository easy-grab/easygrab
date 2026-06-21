# Easy Grab Deployment

This guide covers local testing, Vercel frontend hosting, custom domain setup for `easygrab.fun`, and the encrypted history API.

## Local Testing

Create `.env` from `.env.example`.

```bash
VITE_PUBLIC_APP_URL=http://127.0.0.1:5173
VITE_API_URL=http://127.0.0.1:8787
VITE_MAINNET_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
VITE_DEVNET_RPC_URL=https://api.devnet.solana.com
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
3. Confirm `SOL per claim` starts at `0.05`.
4. Confirm the batch preview shows the 1% platform fee.
5. Generate a devnet batch.
6. Fund the batch.
7. Open a claim link.
8. Claim with wallet or paste a Solana address.
9. Confirm transaction links open on Solscan.

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

## Production Checklist

- `easygrab.fun` serves the Vercel frontend over HTTPS.
- `VITE_PUBLIC_APP_URL` is set to `https://easygrab.fun`.
- `VITE_API_URL` points to an HTTPS API endpoint.
- `VITE_MAINNET_RPC_URL` uses a dedicated RPC provider.
- GitHub Actions CI passes.
- CodeQL is enabled.
- Dependabot is enabled.
- README, SECURITY, THREAT_MODEL, and TRANSPARENCY disclose:
  - minimum claim size: `0.05 SOL`
  - platform fee: `1%`
  - fee recipient: `FDZ6AkGe3s4JN5jkwzYxzv1fTJkjgHN2nmXVQ6oiBQNT`
  - fee use: Easy Grab marketing and ecosystem growth
