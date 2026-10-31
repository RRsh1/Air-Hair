import type { IsoDate } from "@/lib/timeline/days";

/** +972501234567 → 050-123-4567 */
export function formatMobile(e164: string): string {
  const local = e164.startsWith("+972") ? `0${e164.slice(4)}` : e164;
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : local;
}

const shortDate = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "2-digit", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const asUtc = (date: IsoDate) => new Date(`${date}T00:00:00Z`);

/** "15.11.26" */
export const formatShort = (date: IsoDate) => shortDate.format(asUtc(date));
/** "15 בנובמבר 2026" */
export const formatLong = (date: IsoDate) => longDate.format(asUtc(date));

const relative = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
/** "היום", "אתמול", "לפני 5 ימים", "לפני 3 חודשים" */
export function formatAgo(at: Date, now: Date): string {
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  if (days < 31) return relative.format(-days, "day");
  if (days < 365) return relative.format(-Math.round(days / 30), "month");
  return relative.format(-Math.round(days / 365), "year");
}
