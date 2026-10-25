import { z } from "zod";

/**
 * Design tokens of the patient app. Every patient component reads colors and radii only from
 * these CSS variables, so a clinic's published theme (clinic_themes.tokens) restyles the whole
 * app without code changes. Unknown or invalid values fall back to the Hair&Air defaults.
 */

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const patientThemeSchema = z.object({
  background: color.default("#eef2f1"),
  surface: color.default("#ffffff"),
  ink: color.default("#15242a"),
  muted: color.default("#5b6b70"),
  line: color.default("#d6dedf"),
  accent: color.default("#1f5c63"),
  accentInk: color.default("#ffffff"),
  film: color.default("#142126"),
  filmFrame: color.default("#22343a"),
  radius: z.number().int().min(0).max(24).default(12),
});

export type PatientTheme = z.infer<typeof patientThemeSchema>;

export function parsePatientTheme(raw: unknown): PatientTheme {
  const parsed = patientThemeSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : patientThemeSchema.parse({});
}

export const defaultPatientTheme = parsePatientTheme({});

export function themeToCssVars(theme: PatientTheme): Record<string, string> {
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
  };
}
