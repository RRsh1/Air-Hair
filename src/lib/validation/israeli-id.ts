/**
 * Israeli ID number (Teudat Zehut) normalization and check-digit validation.
 * Returns the 9-digit normalized form, or null when invalid.
 */
export function normalizeIsraeliId(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^\d{5,9}$/.test(digits)) return null;

  const id = digits.padStart(9, "0");
  if (id === "000000000") return null;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let step = Number(id[i]) * ((i % 2) + 1);
    if (step > 9) step -= 9;
    sum += step;
  }
  return sum % 10 === 0 ? id : null;
}
