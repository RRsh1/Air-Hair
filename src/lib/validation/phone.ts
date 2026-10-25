/** An E.164 Israeli mobile number that passed normalizeIsraeliMobile. */
export type NormalizedMobile = string & { readonly __brand: "NormalizedMobile" };

/**
 * Israeli mobile number normalization to E.164 (+9725XXXXXXXX).
 * Only mobile numbers are accepted, because login codes are sent by SMS.
 * Accepts: 050-1234567, 0501234567, +972501234567, 00972501234567, 972-50-123-4567, (050) 123 4567
 */
export function normalizeIsraeliMobile(input: string): NormalizedMobile | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;

  if (digits.startsWith("972")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Mobile numbers: 5X followed by 7 digits.
  if (!/^5\d{8}$/.test(digits)) return null;
  return `+972${digits}` as NormalizedMobile;
}

/** Last digits for display ("נשלח קוד למספר המסתיים ב-4567"), never the full number. */
export function maskPhone(e164: string): string {
  return `•••${e164.slice(-4)}`;
}
