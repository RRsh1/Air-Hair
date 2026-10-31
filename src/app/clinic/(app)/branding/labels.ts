import type { BlockName } from "@/lib/theme/patient-theme";

/** Hebrew names for everything a clinic edits in its patient-app theme. */

export const blockLabels: Record<BlockName, { name: string; about: string }> = {
  base: { name: "בסיס", about: "רקע, משטחים, טקסט והדגשה לכל המסכים" },
  header: { name: "כותרת עליונה", about: "הלוגו או שם המרפאה בראש המסך" },
  hero: { name: "פתיח", about: "הברכה ויום ההחלמה" },
  ruler: { name: "סרגל ההחלמה", about: "איפה המטופל נמצא בתקופת המעקב" },
  capture: { name: "הצילום היומי", about: "שלוש הזוויות של היום" },
  guidance: { name: "הנחיות", about: "ההוראות וההמלצות של המרפאה ליום" },
  timeline: { name: "יומן", about: "לוח החודשים והימים" },
  button: { name: "כפתורים", about: "הפעולה הראשית בכל מסך" },
  footer: { name: "תחתית", about: "הקישור למדיניות הפרטיות" },
};

export const blockOrder: BlockName[] = ["base", "header", "hero", "ruler", "capture", "guidance", "timeline", "button", "footer"];

export const roleLabels: Record<string, string> = {
  bg: "רקע",
  surface: "משטח",
  ink: "טקסט",
  muted: "טקסט משני",
  line: "קווים",
  accent: "הדגשה",
  accentInk: "טקסט על הדגשה",
  heading: "כותרות",
  tint: "גוון רקע",
};

/** Display options per block: option key → Hebrew label for each value. */
export const optionLabels: Record<string, { label: string; values: Record<string, string> }> = {
  variant: { label: "תצוגה", values: {} },
  logoSize: { label: "גודל הלוגו", values: { s: "קטן", m: "בינוני", l: "גדול" } },
  shape: { label: "צורה", values: { rounded: "מעוגל", pill: "גלולה", square: "ישר" } },
};

export const variantLabels: Partial<Record<BlockName, Record<string, string>>> = {
  header: { inline: "בשורה", bar: "פס צבע", centered: "ממורכז" },
  hero: { numeral: "מספר גדול", compact: "קומפקטי", banner: "באנר" },
  ruler: { ticks: "שנתות", bar: "פס", hidden: "מוסתר" },
  capture: { tiles: "אריחים", rows: "שורות" },
  guidance: { list: "רשימה", cards: "כרטיסים", rule: "פס צד" },
};

export const scaleLabels = { compact: "קטן", standard: "רגיל", large: "גדול" } as const;
export const positionLabels = { "bottom-end": "למטה משמאל", "bottom-start": "למטה מימין", "top-end": "למעלה משמאל", "top-start": "למעלה מימין" } as const;
