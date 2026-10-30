/**
 * Starting points a clinic picks and then adjusts block by block. Each must pass themeIssues
 * (checked in tests). Tokens are partial: anything left out keeps the default.
 */

type Swatch = { hex: string; name: string };
type PresetTokens = {
  palette?: Record<string, Swatch | null>;
  radius?: number;
  typography?: Record<string, string | number>;
  blocks?: Record<string, Record<string, unknown>>;
  logo?: Record<string, unknown>;
};

export const themePresets = {
  /** Surgical ceil blue on porcelain, IBM Plex. The Hair&Air default. */
  scrubs: { label: "חדר טיפולים", tokens: {} },

  /** Stone greys with a forest-green accent and serif headings. */
  granite: {
    label: "גרניט",
    tokens: {
      palette: {
        s1: { hex: "#ececea", name: "אבן" },
        s2: { hex: "#fbfbfa", name: "גיר" },
        s3: { hex: "#1d1f1c", name: "פחם" },
        s4: { hex: "#575b54", name: "אפור טחב" },
        s5: { hex: "#cfd1cb", name: "קו" },
        s6: { hex: "#2f5d46", name: "יער" },
        s7: { hex: "#dbe5dd", name: "מרווה" },
        s8: { hex: "#1d1f1c", name: "פחם" },
      },
      radius: 4,
      typography: { heading: "frank", body: "plex", numeral: "frank", headingWeight: 600 },
      blocks: {
        header: { variant: "centered" },
        hero: { variant: "numeral" },
        guidance: { variant: "rule" },
        button: { shape: "square" },
      },
    },
  },

  /** Night navy with brass, a dark interface. */
  night: {
    label: "לילה",
    tokens: {
      palette: {
        s1: { hex: "#0e1a22", name: "לילה" },
        s2: { hex: "#16242e", name: "צפחה כהה" },
        s3: { hex: "#e9eef1", name: "שלג" },
        s4: { hex: "#9fb0ba", name: "ערפל" },
        s5: { hex: "#2a3a45", name: "קו" },
        s6: { hex: "#d0a956", name: "פליז" },
        s7: { hex: "#24343f", name: "צל" },
        s8: { hex: "#071118", name: "תהום" },
        s9: { hex: "#1a1408", name: "שחור חם" },
      },
      radius: 14,
      typography: { heading: "heebo", body: "heebo", numeral: "heebo", headingWeight: 700 },
      blocks: {
        base: { accentInk: "s9" },
        header: { variant: "bar", bg: "s8", ink: "s4" },
        timeline: { ink: "s3" },
        capture: { variant: "rows" },
        guidance: { variant: "cards" },
        button: { ink: "s9", shape: "pill" },
      },
    },
  },

  /** Maximum readability for older patients: larger type, cobalt on white, rows instead of tiles. */
  clear: {
    label: "קריא",
    tokens: {
      palette: {
        s1: { hex: "#ffffff", name: "לבן" },
        s2: { hex: "#f1f4f7", name: "ענן" },
        s3: { hex: "#0a1014", name: "שחור" },
        s4: { hex: "#36434b", name: "גרפיט" },
        s5: { hex: "#c3ccd2", name: "קו" },
        s6: { hex: "#0b4f8a", name: "קובלט" },
        s7: { hex: "#dfeaf5", name: "קובלט בהיר" },
        s8: { hex: "#0a1014", name: "שחור" },
      },
      radius: 10,
      typography: { heading: "rubik", body: "rubik", numeral: "secular", headingWeight: 700, scale: "large" },
      blocks: {
        hero: { variant: "banner", bg: "s7" },
        ruler: { variant: "bar" },
        capture: { variant: "rows" },
        guidance: { variant: "cards" },
      },
    },
  },
} satisfies Record<string, { label: string; tokens: PresetTokens }>;

export type ThemePresetName = keyof typeof themePresets;
