"use client";

import "@fontsource/ibm-plex-sans-hebrew/400.css";
import "@fontsource/ibm-plex-sans-hebrew/500.css";
import "@fontsource/ibm-plex-sans-hebrew/600.css";
import "@fontsource/ibm-plex-sans-hebrew/700.css";
import "@fontsource-variable/heebo";
import "@fontsource-variable/rubik";
import "@fontsource-variable/assistant";
import "@fontsource-variable/frank-ruhl-libre";
import "@fontsource-variable/noto-serif-hebrew";
import "@fontsource/secular-one";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { fontStack, patientFontIds, patientFonts } from "@/lib/theme/fonts";
import {
  logoPositions,
  parsePatientTheme,
  swatchHex,
  swatchIds,
  themeIssues,
  type BlockName,
  type PatientTheme,
  type SwatchId,
} from "@/lib/theme/patient-theme";
import { publishThemeAction } from "./actions";
import { blockLabels, blockOrder, optionLabels, positionLabels, roleLabels, scaleLabels, variantLabels } from "./labels";
import { ThemePreview } from "./preview";

type Preset = { id: string; label: string; theme: PatientTheme };
type Tab = "presets" | "colors" | "type" | "blocks" | "logo";
const tabs: { id: Tab; label: string }[] = [
  { id: "presets", label: "סגנון" },
  { id: "colors", label: "צבעים" },
  { id: "type", label: "טקסט" },
  { id: "blocks", label: "בלוקים" },
  { id: "logo", label: "לוגו" },
];

export function BrandingEditor({
  published,
  presets,
  clinicName,
  slug,
  logoId: initialLogoId,
}: {
  published: PatientTheme;
  presets: Preset[];
  clinicName: string;
  slug: string;
  logoId: string | null;
}) {
  const [baseline, setBaseline] = useState(published);
  const [theme, setThemeRaw] = useState(published);
  const [tab, setTab] = useState<Tab>("presets");
  const [selected, setSelected] = useState<BlockName | null>(null);
  const [logoId, setLogoId] = useState(initialLogoId);
  const [status, setStatus] = useState<{ kind: "idle" | "published" | "error"; message?: string }>({ kind: "idle" });
  const [publishing, startPublish] = useTransition();

  const issues = useMemo(() => themeIssues(theme), [theme]);
  const dirty = JSON.stringify(theme) !== JSON.stringify(baseline);
  const logoSrc = logoId ? `/c/${slug}/logo/${logoId}` : null;

  /** Every change goes through the schema, so the draft is always a valid theme. */
  const setTheme = (update: (t: PatientTheme) => unknown) => {
    setThemeRaw((t) => parsePatientTheme(update(t)));
    setStatus({ kind: "idle" });
  };
  const setBlock = (block: BlockName, key: string, value: unknown) =>
    setTheme((t) => ({ ...t, blocks: { ...t.blocks, [block]: { ...t.blocks[block], [key]: value } } }));

  const selectBlock = (block: BlockName) => {
    setSelected(block);
    setTab("blocks");
  };

  const publish = () =>
    startPublish(async () => {
      const result = await publishThemeAction(theme);
      if (result.status === "published") {
        setBaseline(theme);
        setStatus({ kind: "published", message: `גרסה ${result.version} פורסמה למטופלים` });
      } else setStatus({ kind: "error", message: result.message });
    });

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 bg-paper px-1 pb-3 pt-1">
          <nav aria-label="חלקי העורך" className="flex rounded-md border border-line bg-surface p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={`h-9 rounded-[5px] px-3.5 text-[0.9375rem] ${tab === t.id ? "bg-ink font-semibold text-white" : "text-ink hover:bg-paper"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {dirty && (
              <button type="button" onClick={() => setTheme(() => baseline)} className="h-10 px-2 text-[0.9375rem] text-slate hover:text-ink">
                ביטול השינויים
              </button>
            )}
            <button
              type="button"
              onClick={publish}
              disabled={!dirty || issues.length > 0 || publishing}
              className="h-10 rounded-md bg-petrol px-5 font-semibold text-white hover:bg-petrol-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? "מפרסם…" : "פרסום למטופלים"}
            </button>
          </div>
        </div>

        {status.kind !== "idle" && (
          <p role={status.kind === "error" ? "alert" : "status"} className={`mb-4 text-[0.9375rem] ${status.kind === "error" ? "text-signal" : "text-petrol-strong"}`}>
            {status.message}
          </p>
        )}
        {issues.length > 0 && (
          <div role="alert" className="mb-5 rounded-lg border border-signal/25 bg-signal/5 px-4 py-3">
            <p className="text-[0.9375rem] font-semibold text-signal">
              {issues.length === 1 ? "צירוף צבעים אחד קשה לקריאה" : `${issues.length} צירופי צבעים קשים לקריאה`}. אפשר לפרסם אחרי שיתוקנו.
            </p>
            <ul className="mt-2 space-y-1">
              {issues.map((issue) => (
                <li key={`${issue.block}-${issue.pair}`}>
                  <button type="button" onClick={() => selectBlock(issue.block)} className="text-start text-[0.875rem] text-ink underline-offset-4 hover:underline">
                    {blockLabels[issue.block].name}: {issue.pair}, ניגודיות {issue.ratio} מתוך {issue.required} הנדרשים
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "presets" && <PresetsPanel presets={presets} current={theme} onApply={(p) => setTheme((t) => ({ ...p.theme, logo: t.logo }))} />}
        {tab === "colors" && <ColorsPanel theme={theme} setTheme={setTheme} />}
        {tab === "type" && <TypePanel theme={theme} setTheme={setTheme} />}
        {tab === "blocks" && <BlocksPanel theme={theme} selected={selected} onSelect={setSelected} setBlock={setBlock} />}
        {tab === "logo" && <LogoPanel theme={theme} setTheme={setTheme} logoSrc={logoSrc} onUploaded={setLogoId} />}
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <ThemePreview theme={theme} clinicName={clinicName} logoSrc={logoSrc} selected={selected} onSelect={selectBlock} />
        <p className="mt-3 text-center text-[0.875rem] text-slate">לחיצה על חלק במסך פותחת את ההגדרות שלו</p>
      </div>
    </div>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function Panel({ title, about, children }: { title: string; about?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface px-5 py-5 md:px-6">
      <h2 className="text-[1.125rem] font-semibold">{title}</h2>
      {about && <p className="mt-1 max-w-[60ch] text-[0.9375rem] text-slate">{about}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PresetsPanel({ presets, current, onApply }: { presets: Preset[]; current: PatientTheme; onApply: (p: Preset) => void }) {
  return (
    <Panel title="נקודת פתיחה" about="ערכה מוכנה קובעת צבעים, גופנים ותצוגות. אחרי הבחירה אפשר לשנות כל פרט. הלוגו וההגדרות שלו נשמרים.">
      <ul className="grid gap-3 sm:grid-cols-2">
        {presets.map((preset) => {
          const active = JSON.stringify({ ...preset.theme, logo: current.logo }) === JSON.stringify(current);
          return (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => onApply(preset)}
                aria-pressed={active}
                className={`block w-full overflow-hidden rounded-lg border text-start ${active ? "border-ink ring-1 ring-ink" : "border-line hover:border-slate"}`}
              >
                <span className="flex h-16" style={{ background: swatchHex(preset.theme, preset.theme.blocks.base.bg) }}>
                  {(["s3", "s6", "s7", "s4", "s5"] as SwatchId[]).map((id) => (
                    <span key={id} className="h-full flex-1" style={{ background: swatchHex(preset.theme, id) }} />
                  ))}
                </span>
                <span className="block px-4 py-3">
                  <span className="block text-[1.0625rem] font-semibold" style={{ fontFamily: fontStack(preset.theme.typography.heading) }}>
                    {preset.label}
                  </span>
                  <span className="block text-[0.8125rem] text-slate" dir="ltr">
                    {patientFonts[preset.theme.typography.heading].label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ColorsPanel({ theme, setTheme }: { theme: PatientTheme; setTheme: (u: (t: PatientTheme) => unknown) => void }) {
  const setSwatch = (id: SwatchId, value: { hex: string; name: string } | null) => setTheme((t) => ({ ...t, palette: { ...t.palette, [id]: value } }));
  return (
    <Panel title="הפלטה" about="עד עשרה צבעים עם שם. כל חלק במסך בוחר מתוכם, כך ששינוי צבע כאן מתעדכן בכל מקום שמשתמש בו.">
      <ul className="grid gap-3 sm:grid-cols-2">
        {swatchIds.map((id, index) => {
          const swatch = theme.palette[id];
          if (!swatch)
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSwatch(id, { hex: "#8a6d3b", name: `צבע ${index + 1}` })}
                  className="flex h-full min-h-[4.25rem] w-full items-center justify-center rounded-md border border-dashed border-line text-[0.9375rem] text-slate hover:border-petrol hover:text-petrol"
                >
                  הוספת צבע
                </button>
              </li>
            );
          return (
            <li key={id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
              <label className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line" style={{ background: swatch.hex }}>
                <span className="sr-only">צבע של {swatch.name}</span>
                <input type="color" value={swatch.hex} onChange={(e) => setSwatch(id, { ...swatch, hex: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
              <div className="min-w-0 flex-1">
                <label htmlFor={`name-${id}`} className="sr-only">
                  שם הצבע
                </label>
                <input
                  id={`name-${id}`}
                  value={swatch.name}
                  maxLength={24}
                  onChange={(e) => setSwatch(id, { ...swatch, name: e.target.value || swatch.name })}
                  className="block h-9 w-full rounded border border-transparent px-1.5 text-[1rem] font-medium hover:border-line focus:border-petrol focus:outline-none"
                />
                <span className="block px-1.5 text-[0.8125rem] uppercase tabular-nums text-slate" dir="ltr">
                  {swatch.hex}
                </span>
              </div>
              {index >= 8 && (
                <button type="button" onClick={() => setSwatch(id, null)} className="text-[0.875rem] text-slate hover:text-signal">
                  הסרה
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function TypePanel({ theme, setTheme }: { theme: PatientTheme; setTheme: (u: (t: PatientTheme) => unknown) => void }) {
  const t = theme.typography;
  const setType = (key: string, value: unknown) => setTheme((th) => ({ ...th, typography: { ...th.typography, [key]: value } }));
  const fonts = [
    { key: "heading", label: "כותרות", sample: "ההנחיות להיום" },
    { key: "body", label: "טקסט רץ", sample: "חפיפה עדינה פעמיים ביום, במים פושרים." },
    { key: "numeral", label: "מספר היום", sample: "יום 9" },
  ] as const;
  return (
    <div className="space-y-4">
      <Panel title="גופנים" about="גופנים עבריים שנבחרו לקריאות טובה בטלפון.">
        <div className="space-y-5">
          {fonts.map((f) => (
            <div key={f.key}>
              <p className="text-[0.9375rem] font-medium">{f.label}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {patientFontIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setType(f.key, id)}
                    aria-pressed={t[f.key] === id}
                    className={`rounded-md border px-3 py-2 text-start ${t[f.key] === id ? "border-ink ring-1 ring-ink" : "border-line hover:border-slate"}`}
                  >
                    <span className="block truncate text-[1.125rem]" style={{ fontFamily: fontStack(id), fontWeight: f.key === "heading" ? t.headingWeight : 400 }}>
                      {f.sample}
                    </span>
                    <span className="block text-[0.75rem] text-slate" dir="ltr">
                      {patientFonts[id].label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="מידות">
        <div className="grid gap-5 sm:grid-cols-2">
          <Segmented label="משקל הכותרות" value={String(t.headingWeight)} options={{ "500": "בינוני", "600": "חזק", "700": "מודגש", "800": "כבד" }} onChange={(v) => setType("headingWeight", Number(v))} />
          <Segmented label="גודל הטקסט" value={t.scale} options={scaleLabels} onChange={(v) => setType("scale", v)} />
          <div>
            <label htmlFor="radius" className="block text-[0.9375rem] font-medium">
              עיגול פינות <span className="font-normal tabular-nums text-slate">{theme.radius}px</span>
            </label>
            <input id="radius" type="range" min={0} max={28} value={theme.radius} onChange={(e) => setTheme((th) => ({ ...th, radius: Number(e.target.value) }))} className="mt-2 w-full accent-[var(--petrol)]" />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function BlocksPanel({
  theme,
  selected,
  onSelect,
  setBlock,
}: {
  theme: PatientTheme;
  selected: BlockName | null;
  onSelect: (b: BlockName | null) => void;
  setBlock: (block: BlockName, key: string, value: unknown) => void;
}) {
  const swatches = swatchIds.filter((id) => theme.palette[id]);
  return (
    <ul className="space-y-2">
      {blockOrder.map((name) => {
        const config = theme.blocks[name] as Record<string, unknown>;
        const open = selected === name;
        const roles = Object.keys(config).filter((k) => typeof config[k] === "string" && (swatchIds as readonly string[]).includes(config[k] as string));
        const options = Object.keys(config).filter((k) => !roles.includes(k));
        return (
          <li key={name} className={`rounded-lg border bg-surface ${open ? "border-ink" : "border-line"}`}>
            <button type="button" onClick={() => onSelect(open ? null : name)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start">
              <span>
                <span className="block text-[1.0625rem] font-semibold">{blockLabels[name].name}</span>
                <span className="block text-[0.875rem] text-slate">{blockLabels[name].about}</span>
              </span>
              <span className="flex shrink-0 -space-x-1.5 space-x-reverse" aria-hidden="true">
                {roles.slice(0, 4).map((r) => (
                  <span key={r} className="h-5 w-5 rounded-full border-2 border-surface" style={{ background: swatchHex(theme, config[r] as SwatchId) }} />
                ))}
              </span>
            </button>
            {open && (
              <div className="space-y-5 border-t border-line px-5 pb-5 pt-4">
                {options.map((key) => {
                  const values = key === "variant" ? variantLabels[name] : optionLabels[key]?.values;
                  if (!values) return null;
                  return <Segmented key={key} label={optionLabels[key]?.label ?? key} value={String(config[key])} options={values} onChange={(v) => setBlock(name, key, v)} />;
                })}
                {roles.map((role) => (
                  <div key={role}>
                    <p className="text-[0.9375rem] font-medium">{roleLabels[role] ?? role}</p>
                    <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={roleLabels[role] ?? role}>
                      {swatches.map((id) => {
                        const on = config[role] === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setBlock(name, role, id)}
                            title={theme.palette[id]!.name}
                            className={`flex h-9 items-center gap-2 rounded-full border pe-3 ps-1 text-[0.8125rem] ${on ? "border-ink ring-1 ring-ink" : "border-line hover:border-slate"}`}
                          >
                            <span className="h-7 w-7 rounded-full border border-line" style={{ background: theme.palette[id]!.hex }} />
                            {theme.palette[id]!.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LogoPanel({
  theme,
  setTheme,
  logoSrc,
  onUploaded,
}: {
  theme: PatientTheme;
  setTheme: (u: (t: PatientTheme) => unknown) => void;
  logoSrc: string | null;
  onUploaded: (id: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setLogo = (key: string, value: unknown) => setTheme((t) => ({ ...t, logo: { ...t.logo, [key]: value } }));

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    const body = new FormData();
    body.set("logo", file);
    const response = await fetch("/clinic/branding/logo", { method: "POST", body }).catch(() => null);
    const result = response ? ((await response.json().catch(() => null)) as { status: string; logoId?: string; message?: string } | null) : null;
    setUploading(false);
    if (result?.status === "saved" && result.logoId) onUploaded(result.logoId);
    else setError(result?.message ?? "ההעלאה נכשלה. נסו שוב.");
  };

  return (
    <div className="space-y-4">
      <Panel title="הלוגו של המרפאה" about="מופיע בראש המסך ועל כל תמונה של המטופל. הקבצים המקוריים נשמרים נקיים, והלוגו נצרב רק בהורדה.">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-20 w-44 items-center justify-center rounded-md border border-line bg-paper px-3">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- clinic logo route
              <img src={logoSrc} alt="הלוגו הנוכחי" className="max-h-14 max-w-full object-contain" />
            ) : (
              <span className="text-[0.875rem] text-slate">אין לוגו</span>
            )}
          </div>
          <div>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-petrol px-4 font-semibold text-petrol hover:bg-petrol hover:text-white">
              {uploading ? "מעלה…" : logoSrc ? "החלפת הלוגו" : "העלאת לוגו"}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            <p className="mt-1.5 text-[0.875rem] text-slate">מומלץ קובץ PNG עם רקע שקוף, עד 1MB</p>
            {error && (
              <p role="alert" className="mt-1 text-[0.875rem] text-signal">
                {error}
              </p>
            )}
          </div>
        </div>
      </Panel>
      <Panel title="הלוגו על התמונות">
        <div className="space-y-5">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={theme.logo.overlay} onChange={(e) => setLogo("overlay", e.target.checked)} className="h-5 w-5 accent-[var(--petrol)]" />
            <span className="text-[1rem]">להציג את הלוגו על תמונות המטופל</span>
          </label>
          {theme.logo.overlay && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Segmented label="מיקום" value={theme.logo.position} options={Object.fromEntries(logoPositions.map((p) => [p, positionLabels[p]]))} onChange={(v) => setLogo("position", v)} />
              <Segmented label="גודל" value={theme.logo.size} options={{ s: "קטן", m: "בינוני", l: "גדול" }} onChange={(v) => setLogo("size", v)} />
              <Segmented label="רקע מאחורי הלוגו" value={theme.logo.backing} options={{ none: "בלי", plate: "לוחית" }} onChange={(v) => setLogo("backing", v)} />
              <div>
                <label htmlFor="opacity" className="block text-[0.9375rem] font-medium">
                  שקיפות <span className="font-normal tabular-nums text-slate">{Math.round(theme.logo.opacity * 100)}%</span>
                </label>
                <input id="opacity" type="range" min={30} max={100} value={Math.round(theme.logo.opacity * 100)} onChange={(e) => setLogo("opacity", Number(e.target.value) / 100)} className="mt-2 w-full accent-[var(--petrol)]" />
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-[0.9375rem] font-medium">{label}</p>
      <div
        className={`mt-2 gap-1 rounded-md border border-line bg-paper p-1 ${Object.keys(options).length > 3 ? "grid grid-cols-2" : "flex"}`}
        role="radiogroup"
        aria-label={label}
      >
        {Object.entries(options).map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            onClick={() => onChange(key)}
            className={`h-9 flex-1 whitespace-nowrap rounded-[5px] px-3 text-[0.9375rem] ${value === key ? "bg-surface font-semibold shadow-[0_1px_2px_rgb(23_38_43/0.15)]" : "text-slate hover:text-ink"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
