import { z } from "zod";
import { fontStack, patientFontIds, type PatientFontId } from "./fonts";

/**
 * The patient app's design, as data a clinic edits block by block.
 *
 *  - palette:    up to 10 named colors (swatches). Every color on screen comes from a swatch.
 *  - blocks:     each part of the screen picks swatches for its roles (background, text, heading,
 *                accent…) and a variant from its display palette (e.g. guidance as list or cards).
 *  - typography: curated Hebrew faces for headings, body and the day numeral, and a type scale.
 *  - logo:       how the clinic logo sits on photos (overlaid when shown, burned in on download).
 *
 * Colors compile to CSS variables (themeToCss) that the layout streams per clinic; variants are
 * read by components from the parsed theme. Each field falls back to its own default when missing
 * or invalid, so an old or partly broken theme never resets the rest.
 */

const field = <T extends z.ZodType>(schema: T, fallback: z.output<T>) =>
  schema.default(fallback as never).catch(fallback as never);

/** An object whose fields all have defaults: missing → all defaults; not an object → all defaults. */
function group<S extends z.ZodRawShape>(shape: S) {
  const schema = z.object(shape);
  return schema.prefault({} as never).catch(() => schema.parse({}));
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const swatchIds = [
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
] as const;
export type SwatchId = (typeof swatchIds)[number];
const swatch = z.enum(swatchIds);

export const defaultPalette: Record<
  SwatchId,
  { hex: string; name: string } | null
> = {
  s1: { hex: "#f2f5f6", name: "פורצלן" },
  s2: { hex: "#ffffff", name: "לבן" },
  s3: { hex: "#13232b", name: "דיו" },
  s4: { hex: "#4f6470", name: "צפחה" },
  s5: { hex: "#d5dee2", name: "קו" },
  s6: { hex: "#1c5e7e", name: "תכלת ניתוח" },
  s7: { hex: "#dce8ee", name: "תכלת בהיר" },
  s8: { hex: "#0d2a38", name: "עומק" },
  s9: null,
  s10: null,
};

const paletteSchema = group(
  Object.fromEntries(
    swatchIds.map((id) => [
      id,
      field(
        z.object({ hex, name: z.string().trim().min(1).max(24) }).nullable(),
        defaultPalette[id],
      ),
    ]),
  ) as unknown as Record<SwatchId, z.ZodType<{ hex: string; name: string } | null>>,
);

/** One block: its color roles (swatch ids) and display options. */
function block<R extends Record<string, SwatchId>, O extends z.ZodRawShape>(
  roles: R,
  options: O,
) {
  return group({
    ...(Object.fromEntries(
      Object.entries(roles).map(([role, id]) => [role, field(swatch, id)]),
    ) as unknown as {
      [K in keyof R]: z.ZodType<SwatchId>;
    }),
    ...options,
  });
}

export const logoPositions = [
  "bottom-end",
  "bottom-start",
  "top-end",
  "top-start",
] as const;
const font = z.enum(patientFontIds);

export const patientThemeSchema = z.object({
  palette: paletteSchema,
  radius: field(z.number().int().min(0).max(28), 12),
  typography: group({
    heading: field(font, "plex"),
    body: field(font, "plex"),
    numeral: field(font, "plex"),
    headingWeight: field(
      z.union([z.literal(500), z.literal(600), z.literal(700), z.literal(800)]),
      600,
    ),
    scale: field(z.enum(["compact", "standard", "large"]), "standard"),
  }),
  blocks: group({
    base: block(
      {
        bg: "s1",
        surface: "s2",
        ink: "s3",
        muted: "s4",
        line: "s5",
        accent: "s6",
        accentInk: "s2",
      },
      {},
    ),
    header: block(
      { bg: "s1", ink: "s4" },
      {
        variant: field(z.enum(["inline", "bar", "centered"]), "inline"),
        logoSize: field(z.enum(["s", "m", "l"]), "m"),
      },
    ),
    hero: block(
      { bg: "s2", ink: "s3", muted: "s4" },
      { variant: field(z.enum(["numeral", "compact", "banner"]), "numeral") },
    ),
    ruler: block(
      { ink: "s3", accent: "s6", line: "s5", muted: "s4" },
      { variant: field(z.enum(["ticks", "bar", "hidden"]), "ticks") },
    ),
    timeline: block({ ink: "s3", muted: "s4", accent: "s6", line: "s5", tint: "s7" }, {}),
    capture: block(
      { bg: "s2", ink: "s3", muted: "s4", accent: "s6", line: "s5" },
      { variant: field(z.enum(["tiles", "rows"]), "tiles") },
    ),
    guidance: block(
      {
        bg: "s2",
        ink: "s3",
        heading: "s3",
        muted: "s4",
        accent: "s6",
        line: "s5",
      },
      { variant: field(z.enum(["list", "cards", "rule"]), "list") },
    ),
    button: block(
      { bg: "s6", ink: "s2" },
      { shape: field(z.enum(["rounded", "pill", "square"]), "rounded") },
    ),
    footer: block({ ink: "s4" }, {}),
  }),
  logo: group({
    overlay: field(z.boolean(), true),
    position: field(z.enum(logoPositions), "bottom-end"),
    size: field(z.enum(["s", "m", "l"]), "m"),
    opacity: field(z.number().min(0.3).max(1), 0.9),
    backing: field(z.enum(["none", "plate"]), "none"),
  }),
});

export type PatientTheme = z.infer<typeof patientThemeSchema>;
export type ThemeBlocks = PatientTheme["blocks"];
export type BlockName = keyof ThemeBlocks;

export function parsePatientTheme(raw: unknown): PatientTheme {
  const parsed = patientThemeSchema.safeParse(
    raw && typeof raw === "object" ? raw : {},
  );
  const theme = parsed.success ? parsed.data : patientThemeSchema.parse({});
  return theme;
}

export const defaultPatientTheme = parsePatientTheme({});

/** A swatch's color; an empty or missing swatch falls back to the default palette's. */
export function swatchHex(theme: PatientTheme, id: SwatchId): string {
  return theme.palette[id]?.hex ?? defaultPalette[id]?.hex ?? "#000000";
}

const prefixes: Record<BlockName, string> = {
  base: "p",
  header: "hd",
  hero: "hr",
  ruler: "rl",
  timeline: "tl",
  capture: "cp",
  guidance: "gd",
  button: "bt",
  footer: "ft",
};

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** CSS custom properties: one per block role (e.g. --gd-heading), plus type and shape. */
export function themeToCssVars(theme: PatientTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, config] of Object.entries(theme.blocks) as [
    BlockName,
    Record<string, unknown>,
  ][]) {
    for (const [role, value] of Object.entries(config)) {
      if (
        typeof value === "string" &&
        (swatchIds as readonly string[]).includes(value)
      ) {
        vars[`--${prefixes[name]}-${kebab(role)}`] = swatchHex(
          theme,
          value as SwatchId,
        );
      }
    }
  }
  const t = theme.typography;
  // The segmented control's thumb must read lighter than its tinted track, dark themes included.
  const surface = swatchHex(theme, theme.blocks.base.surface);
  const track = swatchHex(theme, theme.blocks.timeline.tint);
  const ink = swatchHex(theme, theme.blocks.base.ink);
  const raised = luminance(surface) > luminance(track) ? surface : mixHex(track, ink, 0.2);
  return {
    ...vars,
    "--p-raised": raised,
    "--p-radius": `${theme.radius}px`,
    "--font-p-heading": fontStack(t.heading),
    "--font-p-body": fontStack(t.body),
    "--font-p-numeral": fontStack(t.numeral),
    "--p-weight-heading": String(t.headingWeight),
    "--bt-radius": {
      rounded: `${theme.radius}px`,
      pill: "999px",
      square: "2px",
    }[theme.blocks.button.shape],
    "--logo-opacity": String(theme.logo.opacity),
  };
}

/** A complete stylesheet for one clinic's patient pages. Values are validated hex and fixed keywords only. */
export function themeToCss(theme: PatientTheme): string {
  const vars = Object.entries(themeToCssVars(theme))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  const rootSize = { compact: "93.75%", standard: "100%", large: "112.5%" }[
    theme.typography.scale
  ];
  return `.p-root{${vars}}html:has(.p-root){font-size:${rootSize}}`;
}

export const usedFonts = (theme: PatientTheme): PatientFontId[] => [
  ...new Set([
    theme.typography.heading,
    theme.typography.body,
    theme.typography.numeral,
  ]),
];

// ─── Contrast ─────────────────────────────────────────────────────────────────

function mixHex(a: string, b: string, weight: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (n: number, shift: number) => (n >> shift) & 255;
  const c = (shift: number) =>
    Math.round(ch(pa, shift) + (ch(pb, shift) - ch(pa, shift)) * weight)
      .toString(16)
      .padStart(2, "0");
  return `#${c(16)}${c(8)}${c(0)}`;
}

function luminance(color: string): number {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
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

export type ThemeIssue = {
  block: BlockName;
  pair: string;
  ratio: number;
  required: number;
};

/**
 * Text that must stay readable (WCAG AA: 4.5 for text, 3 for large type and marks).
 * Publishing refuses a theme with issues, so a clinic can't make the app unreadable for patients.
 */
export function themeIssues(theme: PatientTheme): ThemeIssue[] {
  const b = theme.blocks;
  const c = (id: SwatchId) => swatchHex(theme, id);
  const heroBg = b.hero.variant === "banner" ? b.hero.bg : b.base.bg;
  const headerBg = b.header.variant === "bar" ? b.header.bg : b.base.bg;
  const guidanceBg = b.guidance.variant === "cards" ? b.guidance.bg : b.base.bg;
  const captureBg = b.capture.variant === "rows" ? b.capture.bg : b.base.bg;
  const checks: [BlockName, string, SwatchId, SwatchId, number][] = [
    ["base", "טקסט על הרקע", b.base.ink, b.base.bg, 4.5],
    ["base", "טקסט על משטח", b.base.ink, b.base.surface, 4.5],
    ["base", "טקסט משני על הרקע", b.base.muted, b.base.bg, 4.5],
    ["base", "טקסט על כפתור", b.base.accentInk, b.base.accent, 4.5],
    ["header", "טקסט הכותרת העליונה", b.header.ink, headerBg, 4.5],
    ["hero", "מספר היום", b.hero.ink, heroBg, 3],
    ["hero", "טקסט משני", b.hero.muted, heroBg, 4.5],
    ["ruler", "תוויות הסרגל", b.ruler.muted, b.base.bg, 4.5],
    ["timeline", "טקסט הציר", b.timeline.ink, b.base.bg, 4.5],
    ["capture", "טקסט הצילום היומי", b.capture.ink, captureBg, 4.5],
    ["guidance", "כותרות ההנחיות", b.guidance.heading, guidanceBg, 3],
    ["guidance", "טקסט ההנחיות", b.guidance.ink, guidanceBg, 4.5],
    ["button", "טקסט הכפתור", b.button.ink, b.button.bg, 4.5],
    ["footer", "טקסט תחתון", b.footer.ink, b.base.bg, 4.5],
  ];
  return checks
    .map(([blockName, pair, fg, bg, required]) => ({
      block: blockName,
      pair,
      ratio: Math.round(contrastRatio(c(fg), c(bg)) * 100) / 100,
      required,
    }))
    .filter((check) => check.ratio < check.required);
}
