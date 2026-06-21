# Threat Model

## Security Goal

Easy Grab lets a creator distribute SOL claim links without trusting a backend hot wallet or exposing claim secrets to the hosting server.

## Assets

- Creator wallet funds.
- Funded claim wallet private keys.
- Claim links and QR codes.
- Recipient wallet destination.
- Encrypted batch history.
- Built production JavaScript.
- Platform fee destination and fee transparency.

## Trust Boundaries

- The browser is trusted only while the user is on the canonical HTTPS domain.
- The static host is trusted to serve the published build, but it does not receive claim secrets because secrets live in URL fragments.
- The encrypted history API stores encrypted payloads and blind storage ids.
- Solana RPC providers are not trusted with private keys.
- Wallet extensions are trusted for transaction review and fee-payer signatures.

## In Scope Threats

| Threat | Current Mitigation |
|---|---|
| Backend operator steals campaign deposits | No central backend custody exists. Rewards sit in temporary Solana wallets. |
| Brute-force claim links | Links encode high-entropy Solana keypair secrets. |
| Server logs capture secrets | Secrets are in URL fragments, not query strings or paths. |
| Dependency vulnerability | `npm audit --omit=dev` runs in CI. Dependabot is enabled. |
| Third-party analytics leak links | Security check blocks common analytics packages and external scripts. |
| Claim replay | Claiming empties the temporary claim wallet. |
| Malicious code added later | CI, CodeQL, PR checklist, and security check run on pull requests. |
| Hidden platform fee | The UI and source disclose the 1% platform fee before funding. |

## Economic Rules

- Minimum claim size: `0.05 SOL`.
- Platform fee: `1%` of funded rewards.
- Platform fee recipient: `FDZ6AkGe3s4JN5jkwzYxzv1fTJkjgHN2nmXVQ6oiBQNT`.
- Fee use: marketing and ecosystem growth.

## Residual Risks

- A leaked claim link can be claimed by anyone.
- A malicious browser extension can read the URL fragment.
- A compromised static host can serve altered JavaScript.
- A phishing domain can imitate Easy Grab.
- There is no trustless expiration or refund in the current version.
