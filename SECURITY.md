# Easy Grab Security Model

Easy Grab links are bearer instruments. Anyone who has the full claim link can claim the funds.

## What Easy Grab Protects Against

- **Server custody risk**: no service wallet stores user SOL.
- **Server secret leakage**: coupon private keys are generated in the browser and placed in URL fragments.
- **Brute force**: Solana keypairs provide 256-bit-class entropy. Guessing a valid funded private key is computationally infeasible.
- **Claim replay**: once a coupon wallet is swept, its balance is gone.
- **Readable server history**: batch history is encrypted before it is sent to the API server.
- **Missing funded batch history**: funding is blocked until encrypted batch history is saved successfully.
- **Hidden service fee**: Easy Grab adds no service fee in this version. Funding transactions only fund the claim wallets and pay Solana network fees.

## Economic Rules

- Minimum claim size: `0.01 SOL`.
- Easy Grab service fee: `0`.
- Solana network fees still apply to funding and claim transactions.

## Important Tradeoffs

- A claim link is money. If it is forwarded, screenshotted, indexed by a browser extension, or leaked, whoever has it can claim.
- Easy Grab is SOL-only in the current version. SPL token support needs associated token account handling.
- Recipients can either connect a wallet or paste a Solana address.
- When claiming to a pasted address, the funded claim wallet pays the network fee and the recipient receives slightly less.
- The app should be served over HTTPS in production.
- Production deployments should set `VITE_PUBLIC_APP_URL` so generated links use the canonical domain.
- Keep the encrypted history API online before allowing mainnet funding.
- Do not use URL query parameters for secrets. Query parameters are often logged. Easy Grab uses hash fragments.

## Operational Rules

- Use devnet before mainnet testing.
- Use low-value coupons for public QR drops.
- Generate one unique coupon per recipient or per QR.
- Set event policies outside the link layer: expiration and refund are not trustless in this wallet-link model.

## Future Escrow Program Notes

A program escrow version should:

- Store only `sha256(secret)` on-chain.
- Require 32-byte random secrets.
- Support recipient-locked coupons.
- Support expiration and creator refunds.
- Consider front-running and race behavior when secrets are revealed in claim transactions.
