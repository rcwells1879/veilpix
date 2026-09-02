/**
 * Browser-side mirror of the server's credit conversion.
 *
 * The 200-credit pack is the limiting tier: reserve 20% of its $11.99 gross
 * revenue and $0.83 in Stripe fees. This also covers the 21% / 22% minimums
 * for the 100 / 50-credit packs, without charging differently by package.
 */
export const TARGET_MARGIN = 0.20;
export const MINIMUM_PRICE_INCREASE = 0.10;
// Freeze the pre-increase conversion from main at 4387967; never compound it.
export const PREVIOUS_BILLABLE_USD_PER_VEILPIX_CREDIT = (11.16 / 200) * 0.88;
export const KIE_CREDIT_USD = 0.005;
export const MIN_NET_USD_PER_VEILPIX_CREDIT = 11.16 / 200;
export const BILLABLE_USD_PER_VEILPIX_CREDIT = (11.99 * (1 - TARGET_MARGIN) - 0.83) / 200;

export function veilpixCreditsFromUsd(usdCost: number): number {
  const costUsd = Math.max(0, Number(usdCost) || 0);
  if (costUsd <= 0) return 0;
  const previousCredits = Math.ceil((costUsd / PREVIOUS_BILLABLE_USD_PER_VEILPIX_CREDIT - 1e-12) * 100) / 100;
  const rawCredits = Math.max(
    costUsd / BILLABLE_USD_PER_VEILPIX_CREDIT,
    previousCredits * (1 + MINIMUM_PRICE_INCREASE)
  );
  return Math.ceil((rawCredits - 1e-12) * 100) / 100;
}

export function veilpixCreditsFromKieCredits(kieCredits: number): number {
  return veilpixCreditsFromUsd((Number(kieCredits) || 0) * KIE_CREDIT_USD);
}
