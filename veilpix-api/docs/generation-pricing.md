# Generation Pricing

All image and video generations use the existing `utils/creditEconomics.js`
conversion, mirrored by `src/utils/creditEconomics.ts` for browser estimates.
Provider rates, model capabilities, and routing remain unchanged from main at
`4387967`. A generation costs the same credits regardless of the purchased pack.

## Margin And Increase

Package prices stay at $3.99/50, $6.99/100, and $11.99/200 credits. Retain the
existing international-card assumption of 4.4% + $0.30 per purchase, rounded up
to a cent: $0.48, $0.61, and $0.83 respectively.

Minimum contribution margins after these fees are 22%, 21%, and 20%, respectively.
Margin means `(gross revenue - allocated Stripe fees - provider cost) / gross
revenue`, not markup or profit divided by net receipts. These are minimums;
the shared generation price and hundredth-credit rounding can exceed them.
Hosting, other operating expenses, taxes, disputes, and any additional payment
or currency-conversion fees are not included.

For each pack, the provider budget per credit is:

```text
(pack price * (1 - margin target) - Stripe fee) / pack credits
```

The smallest budget is $0.04381 per VeilPix credit (the 200-credit pack).
Charge the larger of provider USD cost divided by that budget and 110% of the
previous rounded charge, then round up to a hundredth of a credit. The previous
conversion is frozen at $0.049104 per credit, the main-branch pricing before
this increase. Do not repeatedly increase already-increased prices.

Kie credits retain their existing $0.005 conversion. OpenRouter Seedance retains
the remote's Kie-baseline estimate and quote-protection behavior; this is not a
guarantee of margin against a different upstream provider's actual cost.
Kie video completion still settles using reported consumption when available,
including existing refund and reservation behavior. Already-pending Kie jobs
continue to use the completion-time conversion, as before.

## Validation

Run `npm test` in `veilpix-api/`, then `npm run test:pricing` and `npm run build`
at the repository root. The pricing check executes the real browser estimators
and server adapters across image workflows, Seedance variants, Wan 2.6/2.7,
and Wan 3.0 Standard/Prime, including reference-video and automatic-duration
prices. It checks browser/server parity, the 10% minimum increase, and all
three after-fee margin floors without making paid provider calls.
