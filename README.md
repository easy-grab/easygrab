# Easy Grab

Funded Solana claim links for QR drops, private rewards, events, launch campaigns, and small community payouts.

Ticker: `GRAB`  
Official X: https://x.com/easygrabfun  
Official GitHub: https://github.com/easy-grab/easygrab

## How It Works

Easy Grab creates one temporary Solana wallet per reward link.

1. A creator connects Phantom, Solflare, or Coinbase Wallet.
2. The creator chooses `SOL per claim` and `Claims in batch`. Each claim must be at least `0.05 SOL`.
3. The browser generates temporary claim wallets.
4. The creator funds the batch in one wallet transaction.
5. Each recipient opens a claim link and chooses one of two receive modes:
   - Connect a wallet and receive the full claim amount.
   - Paste a Solana address and receive without connecting a wallet. The funded link pays the network fee, so the received amount is slightly lower.
6. After claim, the funded temporary wallet is emptied and the link is shown as claimed.

## Fees and Minimums

- Minimum claim size: `0.05 SOL` per claim link.
- Platform fee: `1%` of the total reward amount in each funded batch, with a `0.001 SOL` minimum.
- The platform fee is included in the same funding transaction.
- Platform fee recipient: `FDZ6AkGe3s4JN5jkwzYxzv1fTJkjgHN2nmXVQ6oiBQNT`
- Platform fee use: Easy Grab marketing and ecosystem growth.

Example:

```txt
2 links x 0.05 SOL = 0.10 SOL rewards
1% platform fee = 0.001 SOL
Solana network fee is added at transaction time
```

Small batch example:

```txt
1 link x 0.05 SOL = 0.05 SOL rewards
1% would be 0.0005 SOL, so the minimum platform fee applies: 0.001 SOL
Solana network fee is added at transaction time
```

## Current Security Model

- No central Easy Grab hot wallet.
- Batch history is encrypted in the browser before it is sent to the API server.
- The encrypted history storage id is derived from a wallet signature.
- The API server stores encrypted payloads, not readable batch history.
- Claim secrets are carried in the URL fragment after `#`.
- URL fragments are not sent to the static web server during normal HTTP requests.
- A full claim link is a bearer voucher. Whoever has the full link can claim it.
- Short public claim URLs are intentionally not enabled in this version because a server-resolved short link would require the server to recover claim secrets.
- The platform fee and minimum platform fee are visible before funding and paid inside the funding transaction.

## Mainnet RPC

Mainnet should use a dedicated Solana RPC endpoint. The default public mainnet RPC can be online and still return `403 Access forbidden` to browser app traffic, which prevents balance reads and funding transactions.

Create `.env` from `.env.example`:

```bash
VITE_PUBLIC_APP_URL=https://easygrab.fun
VITE_API_URL=https://api.easygrab.fun
VITE_MAINNET_RPC_URL=https://your-mainnet-rpc.example
VITE_DEVNET_RPC_URL=https://api.devnet.solana.com
```

Restart the dev server after changing Vite env vars.

## Wallet Support

Easy Grab currently presents:

- Phantom: https://phantom.com/download
- Solflare: https://solflare.com/download
- Coinbase Wallet: https://www.coinbase.com/wallet/downloads

If a wallet is not detected, the wallet selector opens the official install page. If a wallet is detected, Easy Grab connects to that provider directly and reads the public key from either the connection response or the provider state.

## Local Development

```bash
npm install
npm run api
npm run dev
```

Open the Vite URL, usually `http://127.0.0.1:5173/`.

## Verification

```bash
npm run verify
```

This runs:

1. TypeScript and production build.
2. `npm audit --omit=dev`.
3. Custom security checks for storage and URL-secret mistakes.

## Deployment Notes

- Deploy the static Vite frontend over HTTPS.
- Run the encrypted batch API separately or adapt it to your hosting provider's serverless API format.
- Set `VITE_PUBLIC_APP_URL=https://easygrab.fun` before generating real links.
- Set `VITE_API_URL` to the HTTPS URL of the encrypted history API.
- Set `VITE_MAINNET_RPC_URL` to a reliable mainnet RPC provider before real mainnet use.
- Use Solscan links for transaction verification.

See `DEPLOYMENT.md` for local testing, Vercel domain setup, and production environment variables.

## Security Evidence

The repository includes:

- GitHub Actions CI: `.github/workflows/ci.yml`
- CodeQL: `.github/workflows/codeql.yml`
- Dependabot: `.github/dependabot.yml`
- PR security checklist: `.github/pull_request_template.md`
- Custom scanner: `scripts/security-check.mjs`
