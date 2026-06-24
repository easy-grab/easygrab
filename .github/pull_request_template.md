## Summary

## Security Checklist

- [ ] Does not introduce server-side custody.
- [ ] Does not store coupon secrets in localStorage, sessionStorage, logs, analytics, or URLs before `#`.
- [ ] Does not add third-party scripts to claim pages.
- [ ] Keeps claim links treated as bearer cash.
- [ ] `npm run verify` passes locally.
