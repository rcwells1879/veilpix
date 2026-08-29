/**
 * Browser-side mirror of the server's credit conversion.
 *
 * $11.99 - $0.83 in Stripe fees = $11.16 net for 200 credits. Provider
 * costs may consume at most 88% of that net value to preserve a 12% margin.
 */
export const TARGET_MARGIN = 0.12;
export const KIE_CREDIT_USD = 0.005;
export const MIN_NET_USD_PER_VEILPIX_CREDIT = 11.16 / 200;
export const BILLABLE_USD_PER_VEILPIX_CREDIT = MIN_NET_USD_PER_VEILPIX_CREDIT * (1 - TARGET_MARGIN);

export function veilpixCreditsFromUsd(usdCost: number): number {
  const rawCredits = Math.max(0, (Number(usdCost) || 0) / BILLABLE_USD_PER_VEILPIX_CREDIT);
  if (rawCredits <= 0) return 0;
  return Math.ceil((rawCredits - 1e-12) * 100) / 100;
}

export function veilpixCreditsFromKieCredits(kieCredits: number): number {
  return veilpixCreditsFromUsd((Number(kieCredits) || 0) * KIE_CREDIT_USD);
}
