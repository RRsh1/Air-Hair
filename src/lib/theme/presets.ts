import type { PatientTheme } from "./patient-theme";

/**
 * Starting points a clinic can pick and then adjust. Each passes themeIssues (readable contrast).
 */
export const themePresets = {
  /** Hair&Air default: clinical petrol on cool grey, classic film strip. */
  petrol: {},
  /** Warm sand with a dark bronze accent, outlined blocks, polaroid frames. */
  sand: {
    background: "#f4efe7",
    surface: "#fffdf9",
    ink: "#2b2118",
    muted: "#6a5a4a",
    line: "#e2d7c7",
    accent: "#7a4b1f",
    accentInk: "#ffffff",
    film: "#2b2118",
    filmFrame: "#3a2d22",
    radius: 6,
    headingWeight: 700,
    headingStyle: "underline",
    blocks: "outlined",
    dividers: "dashed",
    filmTemplate: "polaroid",
    backgroundStyle: "gradient",
  },
  /** Deep night blue with gold accent, flat blocks, minimal frames. */
  night: {
    background: "#0f1720",
    surface: "#18232f",
    ink: "#eef3f7",
    muted: "#a3b2bf",
    line: "#2a3846",
    accent: "#e2b45c",
    accentInk: "#1a1407",
    film: "#0a1016",
    filmFrame: "#1c2834",
    radius: 16,
    headingWeight: 600,
    headingStyle: "accent-bar",
    blocks: "flat",
    dividers: "line",
    filmTemplate: "minimal",
    transition: "rise",
  },
  /** High readability for older patients: larger text, strong contrast, bold headings. */
  clear: {
    background: "#ffffff",
    surface: "#f3f6f8",
    ink: "#0b1215",
    muted: "#3d4a50",
    line: "#c9d3d8",
    accent: "#0b4f8a",
    accentInk: "#ffffff",
    radius: 10,
    headingWeight: 800,
    bodyWeight: 500,
    textSize: "large",
    dividers: "line",
    transition: "none",
  },
} satisfies Record<string, Partial<PatientTheme>>;

export type ThemePresetName = keyof typeof themePresets;
