export function formatCreditAmount(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function formatCreditLabel(value: number): string {
  return `${formatCreditAmount(value)} ${value === 1 ? 'credit' : 'credits'}`;
}
