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
- Claim secrets are generated client-side.
- Claim secrets are carried in URL fragments, not query parameters.
- The server does not need a database of coupon secrets.
- Funding includes a visible 1% platform fee, with a 0.001 SOL minimum.
- The platform fee is reinvested into marketing and ecosystem growth.
- Anyone can inspect the source and run `npm run verify`.

## Fee Model

- Minimum claim size: `0.05 SOL`.
- Platform fee: `1%` of funded rewards, with a `0.001 SOL` minimum.
- Recipient: `FDZ6AkGe3s4JN5jkwzYxzv1fTJkjgHN2nmXVQ6oiBQNT`.

## Claims We Should Not Make

- "Impossible to steal."
- "Fully trustless."
- "Audited."
- "Safe for large amounts."
- "No risk."

## Recommended Public Wording

> Easy Grab is non-custodial by design, but claim links are bearer instruments. Treat each link like cash.

> Use small amounts until the code has been independently reviewed.
