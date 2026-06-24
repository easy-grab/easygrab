# Easy Grab

Funded Solana claim links for QR drops, private rewards, events, launch campaigns, and small community payouts.

Ticker: `GRAB`  
Website: https://easygrab.fun  
Official X: https://x.com/easygrabfun  
Official GitHub: https://github.com/easy-grab/easygrab

## How It Works

Easy Grab creates one temporary Solana wallet per reward link.

1. A creator connects Phantom, Solflare, or Coinbase Wallet.
2. The creator chooses `SOL per claim` and `Claims in batch`. Each claim must be at least `0.01 SOL`.
3. The browser generates temporary claim wallets.
4. The encrypted batch history is saved before mainnet funding can start.
5. The creator funds the batch in one wallet transaction.
6. Each recipient opens a claim link and chooses one of two receive modes:
   - Connect a wallet and receive the full claim amount.
   - Paste a Solana address and receive without connecting a wallet. The funded link pays the network fee, so the received amount is slightly lower.
7. After claim, the funded temporary wallet is emptied and the link is shown as claimed.

## Costs and Minimums

- Minimum claim size: `0.01 SOL` per claim link.
- Easy Grab service fee: `0`.
- Creators only fund the claim wallets and pay the Solana network fee required by the funding transaction.
- Address-based recipients receive slightly less because the funded claim wallet pays the Solana network fee for that receive flow.

Example:

```txt
2 links x 0.01 SOL = 0.02 SOL rewards
Easy Grab service fee = 0 SOL
Solana network fee is added at transaction time
```

## Current Security Model

- No central Easy Grab hot wallet.
- Batch history is encrypted in the browser before it is sent to the API server.
- Funding is blocked until encrypted batch history is saved successfully.
- If post-funding status sync is interrupted, encrypted updates are kept in a browser retry queue and retried automatically.
- The encrypted history storage id is derived from a wallet signature.
- The API server stores encrypted payloads, not readable batch history.
- Claim secrets are carried in the URL fragment after `#`.
- URL fragments are not sent to the static web server during normal HTTP requests.
- A full claim link is a bearer voucher. Whoever has the full link can claim it.
- Short public claim URLs are intentionally not enabled in this version because a server-resolved short link would require the server to recover claim secrets.
- Easy Grab does not add a service fee in this version.

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
- Run the encrypted batch API separately on persistent storage, or adapt it to your hosting provider's database/serverless storage.
- Set `VITE_PUBLIC_APP_URL=https://easygrab.fun` before generating real links.
- Set `VITE_API_URL=https://api.easygrab.fun` before mainnet launch.
- Set `VITE_MAINNET_RPC_URL` to a reliable mainnet RPC provider before real mainnet use.
- Set API `ALLOWED_ORIGIN` to the production frontend origin.
- Back up `data/encrypted-batches.json` if using the included file-backed API.
- Use Solscan links for transaction verification.

See `DEPLOYMENT.md` for local testing, Vercel domain setup, and production environment variables.

## Security Evidence

The repository includes:

- GitHub Actions CI: `.github/workflows/ci.yml`
- CodeQL: `.github/workflows/codeql.yml`
- Dependabot: `.github/dependabot.yml`
- PR security checklist: `.github/pull_request_template.md`
- Custom scanner: `scripts/security-check.mjs`
