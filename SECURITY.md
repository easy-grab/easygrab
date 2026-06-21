# Grab Security Model

Grab links are bearer instruments. Anyone who has the full claim link can claim the funds.

## What This MVP Protects Against

- **Server custody risk**: no service wallet stores user SOL.
- **Server secret leakage**: coupon private keys are generated in the browser and placed in URL fragments.
- **Brute force**: Solana keypairs provide 256-bit-class entropy. Guessing a valid funded private key is computationally infeasible.
- **Claim replay**: once a coupon wallet is swept, its balance is gone.
- **Database compromise**: this MVP does not require a coupon database.

## Important Tradeoffs

- A claim link is money. If it is forwarded, screenshotted, indexed by a browser extension, or leaked, whoever has it can claim.
- The current MVP is SOL-only. SPL token support needs associated token account handling.
- The recipient wallet pays the claim transaction fee. This allows the coupon wallet to transfer its full balance.
- The app should be served over HTTPS in production.
- Production deployments should set `VITE_PUBLIC_APP_URL` so generated links use the canonical domain.
- Do not use URL query parameters for secrets. Query parameters are often logged. Grab uses hash fragments.

## Operational Rules

- Default to devnet for testing.
- Use low-value coupons for public QR drops.
- Generate one unique coupon per recipient or per QR.
- Set event policies outside the link layer: expiration and refund are not trustless in this wallet-link MVP.
- For trustless expiration/refund, build the next version with an audited Solana program escrow.

## Future Escrow Program Notes

A program escrow version should:

- Store only `sha256(secret)` on-chain.
- Require 32-byte random secrets.
- Support recipient-locked coupons.
- Support expiration and creator refunds.
- Consider front-running/race behavior when secrets are revealed in claim transactions.
