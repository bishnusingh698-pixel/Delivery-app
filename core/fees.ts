/** Fee amount normalisation, shared by the admin page (client) and the fee product service. */
export function normalizeAmount(amount: string | null | undefined): string | null {
  if (amount === null || amount === undefined) return null;
  const n = Number(String(amount).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}
