import { z } from "zod";

/**
 * Design tokens of the patient app. Every patient component reads its look only from the CSS
 * variables these compile to (see themeToCss), so a clinic's published theme
 * (clinic_themes.tokens) restyles the whole app without code changes.
 *
 * Each field falls back to its own default when missing or invalid, so an old or partly broken
 * theme never resets the rest. New fields are added with a default and need no migration.
 */

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// Casts only satisfy zod's generic overloads; the field keeps the schema's own type.
const field = <T extends z.ZodType>(schema: T, fallback: z.output<T>) =>
  schema.default(fallback as never).catch(fallback as never);

export const logoPositions = ["bottom-end", "bottom-start", "top-end", "top-start"] as const;

export const patientThemeSchema = z.object({
  // Colors
  background: field(color, "#eef2f1"),
  surface: field(color, "#ffffff"),
  ink: field(color, "#15242a"),
  muted: field(color, "#55666b"),
  line: field(color, "#d6dedf"),
  accent: field(color, "#1f5c63"),
  accentInk: field(color, "#ffffff"),
  film: field(color, "#142126"),
  filmFrame: field(color, "#22343a"),
  // Shape and type
  radius: field(z.number().int().min(0).max(24), 12),
  headingWeight: field(z.union([z.literal(500), z.literal(600), z.literal(700), z.literal(800)]), 600),
  bodyWeight: field(z.union([z.literal(400), z.literal(500)]), 400),
  textSize: field(z.enum(["standard", "large"]), "standard"),
  headingStyle: field(z.enum(["plain", "accent-bar", "underline"]), "plain"),
  // Elements
  blocks: field(z.enum(["filled", "outlined", "flat"]), "filled"),
  dividers: field(z.enum(["none", "line", "dashed"]), "none"),
  filmTemplate: field(z.enum(["classic", "minimal", "polaroid"]), "classic"),
  transition: field(z.enum(["none", "fade", "rise"]), "fade"),
  backgroundStyle: field(z.enum(["solid", "gradient"]), "solid"),
  // Clinic logo on photos (overlaid when shown, never burned into the stored file)
  logoOverlay: field(z.boolean(), true),
  logoPosition: field(z.enum(logoPositions), "bottom-end"),
  logoOpacity: field(z.number().min(0.3).max(1), 0.85),
});

export type PatientTheme = z.infer<typeof patientThemeSchema>;

export function parsePatientTheme(raw: unknown): PatientTheme {
  const parsed = patientThemeSchema.safeParse(raw && typeof raw === "object" ? raw : {});
  return parsed.success ? parsed.data : patientThemeSchema.parse({});
}

export const defaultPatientTheme = parsePatientTheme({});

/** CSS custom properties for a theme; the patient layout applies them to `.p-root`. */
export function themeToCssVars(theme: PatientTheme): Record<string, string> {
  const filmTemplates = {
    classic: {
      "--p-strip-bg": theme.film,
      "--p-sprockets": "block",
      "--p-frame-bg": theme.filmFrame,
      "--p-frame-radius": "4px",
      "--p-frame-pad": "0px",
      "--p-frame-label-bg": "rgb(0 0 0 / 0.25)",
      "--p-frame-label-ink": "#ffffff",
      "--p-frame-shadow": "none",
      "--p-frame-ring": "#ffffff",
    },
    minimal: {
      "--p-strip-bg": "transparent",
      "--p-sprockets": "none",
      "--p-frame-bg": theme.surface,
      "--p-frame-radius": `${theme.radius}px`,
      "--p-frame-pad": "0px",
      "--p-frame-label-bg": theme.surface,
      "--p-frame-label-ink": theme.ink,
      "--p-frame-shadow": `0 0 0 1px ${theme.line}`,
      "--p-frame-ring": theme.accent,
    },
    polaroid: {
      "--p-strip-bg": "transparent",
      "--p-sprockets": "none",
      "--p-frame-bg": "#ffffff",
      "--p-frame-radius": "3px",
      "--p-frame-pad": "5px",
      "--p-frame-label-bg": "#ffffff",
      "--p-frame-label-ink": "#1d1d1d",
      "--p-frame-shadow": "0 2px 6px rgb(0 0 0 / 0.14)",
      "--p-frame-ring": theme.accent,
    },
  }[theme.filmTemplate];

  const blocks = {
    filled: { "--p-block-bg": theme.surface, "--p-block-border": "1px solid transparent", "--p-block-pad-x": "1rem" },
    outlined: { "--p-block-bg": "transparent", "--p-block-border": `1px solid ${theme.line}`, "--p-block-pad-x": "1rem" },
    flat: { "--p-block-bg": "transparent", "--p-block-border": "0 solid transparent", "--p-block-pad-x": "0px" },
  }[theme.blocks];

  return {
    "--p-bg": theme.background,
    "--p-surface": theme.surface,
    "--p-ink": theme.ink,
    "--p-muted": theme.muted,
    "--p-line": theme.line,
    "--p-accent": theme.accent,
    "--p-accent-ink": theme.accentInk,
    "--p-film": theme.film,
    "--p-film-frame": theme.filmFrame,
    "--p-radius": `${theme.radius}px`,
    "--p-weight-heading": String(theme.headingWeight),
    "--p-weight-body": String(theme.bodyWeight),
    "--p-heading-bar": theme.headingStyle === "accent-bar" ? `4px solid ${theme.accent}` : "0 solid transparent",
    "--p-heading-bar-pad": theme.headingStyle === "accent-bar" ? "0.6rem" : "0px",
    "--p-heading-underline": theme.headingStyle === "underline" ? `2px solid ${theme.accent}` : "0 solid transparent",
    "--p-heading-underline-pad": theme.headingStyle === "underline" ? "0.3rem" : "0px",
    "--p-divider": { none: "0 solid transparent", line: `1px solid ${theme.line}`, dashed: `1px dashed ${theme.line}` }[theme.dividers],
    "--p-divider-gap": theme.dividers === "none" ? "0px" : "2rem",
    "--p-enter": { none: "none", fade: "p-fade 0.28s ease-out both", rise: "p-rise 0.34s cubic-bezier(.2,.7,.2,1) both" }[theme.transition],
    "--p-root-bg":
      theme.backgroundStyle === "gradient"
        ? `linear-gradient(180deg, ${theme.background} 0%, ${mix(theme.background, theme.surface, 0.6)} 100%)`
        : theme.background,
    "--p-logo-opacity": String(theme.logoOpacity),
    ...filmTemplates,
    ...blocks,
  };
}

/** A complete stylesheet for one clinic's patient pages. */
export function themeToCss(theme: PatientTheme): string {
  const vars = Object.entries(themeToCssVars(theme))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  const large = theme.textSize === "large" ? "html{font-size:112.5%}" : "";
  return `.p-root{${vars}}${large}`;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, weight: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * weight).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type ThemeIssue = { pair: string; ratio: number; required: number };

/**
 * Pairs that must stay readable (WCAG AA: 4.5 for text, 3 for large headings and frame labels).
 * Publishing refuses a theme with issues, so a clinic can't make the app unreadable for patients.
 */
export function themeIssues(theme: PatientTheme): ThemeIssue[] {
  const checks: [string, string, string, number][] = [
    ["ink on background", theme.ink, theme.background, 4.5],
    ["ink on surface", theme.ink, theme.surface, 4.5],
    ["muted on background", theme.muted, theme.background, 4.5],
    ["muted on surface", theme.muted, theme.surface, 4.5],
    ["button text on accent", theme.accentInk, theme.accent, 4.5],
    ["accent on background", theme.accent, theme.background, 3],
  ];
  return checks
    .map(([pair, fg, bg, required]) => ({ pair, ratio: Math.round(contrastRatio(fg, bg) * 100) / 100, required }))
    .filter((check) => check.ratio < check.required);
}
