# Threat Model

## Security Goal

Grab should let a creator hand out SOL claim links without trusting a backend wallet or exposing coupon secrets to the hosting server.

## Assets

- Creator wallet funds.
- Funded coupon wallet private keys.
- Claim links and QR codes.
- Recipient wallet destination.
- Built production JavaScript.

## Trust Boundaries

- The browser is trusted only while the user is on the canonical HTTPS domain.
- The static host is trusted to serve the published build, but it never receives claim secrets because secrets live in URL fragments.
- Solana RPC providers are not trusted with private keys.
- Wallet extensions are trusted for transaction review and fee-payer signatures.

## In Scope Threats

| Threat | Current Mitigation |
|---|---|
| Backend operator steals deposits | No backend custody exists. Coupons are temporary wallets. |
| Brute-force claim links | Links encode high-entropy Solana keypair secrets. |
| Server logs capture secrets | Secrets are in URL fragments, not query strings or paths. |
| Dependency vulnerability | `npm audit --omit=dev` runs in CI. Dependabot is enabled. |
| Third-party analytics leak links | Security check blocks common analytics packages and external scripts. |
| Claim replay | Sweeping empties the coupon wallet. |
| Malicious code added later | CI, CodeQL, PR checklist, and security check run on every pull request. |

## Residual Risks

- A leaked claim link can be claimed by anyone.
- A malicious browser extension can read the URL fragment.
- A compromised static host can serve altered JavaScript.
- A phishing domain can imitate Grab.
- The MVP has no trustless expiration or refund. Creators must keep backup links to reclaim unclaimed coupons.

## Planned Mitigations

- Publish deterministic build hashes on releases.
- Add signed releases.
- Add optional encrypted backup files.
- Add recipient-locked links.
- Add SPL token support.
- Add audited escrow mode for expiration/refund after resolving public-secret race behavior.
