import { z } from "zod";
import { smsSenderNameSchema } from "@/lib/validation/sms-sender";

/**
 * Per-clinic behaviour that may differ between clinics or change over time.
 *
 * Rules for evolving this schema without breaking existing clinics:
 *  - Every new field gets a .default(), so clinics saved before it existed still parse.
 *  - Renames or changed meanings bump CLINIC_SETTINGS_VERSION and add a step to MIGRATIONS.
 *  - Never read clinic_settings.settings directly; always go through parseClinicSettings().
 */

export const CLINIC_SETTINGS_VERSION = 1;

export const patientVisibilityModes = ["clinic_wide", "assigned_only"] as const;
export type PatientVisibilityMode = (typeof patientVisibilityModes)[number];

export const clinicSettingsSchema = z.object({
  version: z.literal(CLINIC_SETTINGS_VERSION).default(CLINIC_SETTINGS_VERSION),

  /** Which patients a doctor sees. Admins always see the whole clinic. */
  patientVisibility: z.enum(patientVisibilityModes).default("clinic_wide"),

  /** Who may edit timeline templates (phases, capture schedule, daily content). */
  timelineEditing: z.enum(["admins_only", "admins_and_doctors"]).default("admins_and_doctors"),

  /** Who may create patient accounts. */
  patientCreation: z.enum(["admins_only", "doctors_only", "admins_and_doctors"]).default("admins_and_doctors"),

  /** Length of the post-surgery follow-up, in months. */
  followUpMonths: z.number().int().min(1).max(36).default(6),

  /** Whether structural timeline changes (phases, capture rules) reach patients already in recovery. */
  structuralChangesApplyTo: z.enum(["new_patients", "all_patients"]).default("new_patients"),

  /** Alphanumeric SMS sender. Null until the admin sets it; the clinic name is used as fallback. */
  smsSenderName: smsSenderNameSchema.nullable().default(null),

  /** Per-clinic switches for features rolled out gradually. Unknown flags are false. */
  featureFlags: z.record(z.string(), z.boolean()).default({}),
});

export type ClinicSettings = z.infer<typeof clinicSettingsSchema>;

export type RawSettings = Record<string, unknown>;
export type SettingsMigrations = Record<number, (settings: RawSettings) => RawSettings>;

/** Step n migrates a version-n object to version n+1. Empty until the first breaking change. */
const MIGRATIONS: SettingsMigrations = {};

/** An object with no version predates versioning (e.g. the column default `{}`), so it is version 1. */
const FIRST_VERSION = 1;

export function migrateSettings(raw: RawSettings, target: number, migrations: SettingsMigrations): RawSettings {
  let current = { ...raw };
  let version = typeof current.version === "number" ? current.version : FIRST_VERSION;
  if (version > target) {
    throw new Error(`Clinic settings version ${version} is newer than this code (${target})`);
  }
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new Error(`No clinic settings migration from version ${version}`);
    current = step(current);
    version += 1;
  }
  return { ...current, version };
}

/** Parse stored settings (possibly partial or old) into a complete, current object. Always save the result whole. */
export function parseClinicSettings(raw: unknown): ClinicSettings {
  const object = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as RawSettings) : {};
  return clinicSettingsSchema.parse(migrateSettings(object, CLINIC_SETTINGS_VERSION, MIGRATIONS));
}

export const defaultClinicSettings: ClinicSettings = parseClinicSettings({});

export function isFeatureEnabled(settings: ClinicSettings, flag: string): boolean {
  return settings.featureFlags[flag] === true;
}
