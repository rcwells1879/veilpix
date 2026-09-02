# Generation Pricing

Updated 2026-09-02. Applies to images and videos, including edits, filters,
adjustments, combined photos, text generation, and reference-guided generation.
Credit-pack prices and purchased balances are unchanged. A generation has the
same credit price regardless of which pack the customer bought.

## Policy

- Raise each existing generation price by at least 10%.
- Minimum contribution margin AFTER Kie cost and standard US Stripe card fees:
  20% for the $11.99/200 pack, 21% for $6.99/100, 22% for $3.99/50.
- These are minimums, not three exact margins. One generation price and the
  existing pack discounts necessarily yield larger differences between packs.
- Images round up to hundredths of a credit. Videos retain whole-credit rounding.
- Existing rounded prices are the baseline for the 10% floor. A provider price
  reduction does not reduce the customer price below that floor.

The policy inputs live in `config/generationPricing.json`. Calculations remain
in the existing image/video helpers and controls. Tests check frontend/backend
agreement and that the policy's pack values still match Checkout.

For each pack:

```text
stripeFee = roundToCents(packPrice * 0.029 + 0.30)
providerBudgetPerCredit = (packPrice * (1 - targetMargin) - stripeFee) / packCredits
requiredCredits = providerCost / min(all packs' providerBudgetPerCredit)
newPrice = roundUp(max(requiredCredits, previousPrice * 1.10))
margin = (creditRevenue - allocatedStripeFee - providerCost) / creditRevenue
```

The limiting pack is 200 credits, with a provider budget of $0.04471 per credit.
The fixed fee is allocated across the purchased pack, not charged per generation.
Historical free/promotional credits have no purchase revenue and cannot be
assigned these margins. This is a contribution margin, not profit after hosting,
support, tax, refunds, or chargebacks. International/currency-conversion fees,
custom Stripe rates, and any separately charged Kie top-up fees are not included.
Revisit the assumptions if actual payment or provider costs differ.

## Rate Research

Sources checked on 2026-09-02:

- [Kie model pricing](https://kie.ai/pricing). Its public table is loaded from
  `POST https://api.kie.ai/client/v1/model-pricing/page`, with `pageNum: 1`,
  `pageSize: 100`, and a `modelDescription` filter. Queries are read-only.
- [Seedance 2.0](https://kie.ai/seedance-2-0): video-reference billing includes
  input plus output duration. Kie credits are $0.005 each at the base rate.
- [Wan 2.6](https://kie.ai/wan-2-6) and
  [Wan 2.7](https://kie.ai/wan-2-7-video).
- [Stripe US pricing](https://stripe.com/us/pricing): 2.9% + $0.30 per successful
  domestic card payment. This is an assumption, not an audit of this account's
  actual processing agreement.

Image rates matched the existing tables: Nano Banana 2 costs 8/12/18 Kie credits
for 1K/2K/4K; Seedream Lite costs 5.5; Pro costs 7/14; Wan Image costs 4.8, or 12
for Pro 4K. Seedream Pro additional input images cost 0.5 Kie credits after the
first. The existing conservative extra-input allowance on Lite is retained.
The legacy Nano Banana Pro route retains one flat charge covering the highest
supported cost, 24 Kie credits for 4K (18 for 1K/2K).

Seedance rates, Kie credits per second (no video / with video):

| Variant | 480p | 720p | 1080p |
| --- | --- | --- | --- |
| Regular | 19 / 11.5 | 41 / 25 | 102 / 62 |
| Fast | 11.7 / 6.8 | 24.8 / 15 | Not offered |
| Mini | 3.8 / 2.4 | 8.2 / 5 | Not offered |

Fast and Mini decreased relative to the app's former cost assumptions; their
old rates remain only as the baseline for the 10% customer-price increase.
Reference duration is conservatively rounded up, capped at 15 seconds, and
defaults to 15 if unavailable. Seedance keeps its existing actual-cost
reconciliation when Kie returns `creditsConsumed` above the estimate.

Wan 2.6 text-to-video costs 70/140/210 Kie credits for 5/10/15 seconds at 720p,
and 104.5/209.5/315 at 1080p. Wan 2.7 reference-to-video costs 16/24 Kie credits
per output second at 720p/1080p.

**Wan Flash limitation:** the public pricing table contains no Flash rate;
the Playground cost-quote endpoint requires authentication, and no local Kie
key is configured. Flash uses a conservative 16/24 Kie-credit-per-second cost
allowance matching Wan 2.7, with no assumed audio discount. This is NOT a
verified Flash tariff or an unconditional margin guarantee. Verify against
actual Kie billing before relying on that margin. No paid jobs were submitted.

## Checks

```bash
npm test --prefix veilpix-api
npm run test:pricing
npm run build
```
