/**
 * Curated Hebrew typefaces a clinic can choose. Each one's @font-face rules are loaded on patient
 * pages (src/app/c/[slug]/layout.tsx); browsers download only the faces a page actually uses.
 */
export const patientFonts = {
  plex: { label: "IBM Plex Sans Hebrew", family: "'IBM Plex Sans Hebrew'", kind: "sans" },
  heebo: { label: "Heebo", family: "'Heebo Variable'", kind: "sans" },
  rubik: { label: "Rubik", family: "'Rubik Variable'", kind: "sans" },
  assistant: { label: "Assistant", family: "'Assistant Variable'", kind: "sans" },
  frank: { label: "Frank Ruhl Libre", family: "'Frank Ruhl Libre Variable'", kind: "serif" },
  notoSerif: { label: "Noto Serif Hebrew", family: "'Noto Serif Hebrew Variable'", kind: "serif" },
  secular: { label: "Secular One", family: "'Secular One'", kind: "display" },
} as const;

export type PatientFontId = keyof typeof patientFonts;
export const patientFontIds = Object.keys(patientFonts) as [PatientFontId, ...PatientFontId[]];

export function fontStack(id: PatientFontId): string {
  const font = patientFonts[id];
  const fallback = font.kind === "serif" ? "'Times New Roman', serif" : "system-ui, 'Arial Hebrew', Arial, sans-serif";
  return `${font.family}, ${fallback}`;
}
