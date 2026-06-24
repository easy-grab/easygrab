# Security Transparency

Easy Grab is designed to be easy to distrust and easy to verify.

## Public Evidence to Show on GitHub

- Source code for the static app.
- `SECURITY.md` for the security model and responsible disclosure.
- `THREAT_MODEL.md` for assets, trust boundaries, mitigations, and residual risks.
- `README.md` for the current product model, local setup, RPC configuration, and deployment notes.
- GitHub Actions CI running:
  - TypeScript build.
  - Dependency audit.
  - Custom security checks.
- CodeQL analysis.
- Dependabot PRs for npm and GitHub Actions updates.

## Claims We Can Safely Make

- Easy Grab does not run a backend hot wallet.
- Easy Grab blocks funding until encrypted batch history has been saved.
- Claim secrets are generated client-side.
- Claim secrets are carried in URL fragments, not query parameters.
- The server does not need a database of coupon secrets.
- Easy Grab adds no service fee in this version.
- Funding still requires Solana network fees.
- Anyone can inspect the source and run `npm run verify`.
- Interrupted encrypted history updates are retried from a local encrypted outbox.

## Cost Model

- Minimum claim size: `0.01 SOL`.
- Easy Grab service fee: `0`.
- Solana network fees apply to funding and claim transactions.

## Claims We Should Not Make

- "Impossible to steal."
- "Fully trustless."
- "Audited."
- "Safe for large amounts."
- "No risk."

## Recommended Public Wording

> Easy Grab is non-custodial by design, but claim links are bearer instruments. Treat each link like cash.

> Use small amounts until the code has been independently reviewed.
