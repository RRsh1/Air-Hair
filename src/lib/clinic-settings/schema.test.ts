import { describe, expect, it } from "vitest";
import { CLINIC_SETTINGS_VERSION, defaultClinicSettings, isFeatureEnabled, migrateSettings, parseClinicSettings } from "./schema";

describe("clinic settings", () => {
  it("fills every default from an empty or missing object", () => {
    expect(parseClinicSettings(null)).toEqual(defaultClinicSettings);
    expect(defaultClinicSettings).toMatchObject({
      version: CLINIC_SETTINGS_VERSION,
      patientVisibility: "clinic_wide",
      timelineEditing: "admins_and_doctors",
      followUpMonths: 6,
      structuralChangesApplyTo: "new_patients",
      smsSenderName: null,
    });
  });

  it("keeps stored values and ignores unknown keys", () => {
    const settings = parseClinicSettings({ patientVisibility: "assigned_only", followUpMonths: 12, legacy: true });
    expect(settings.patientVisibility).toBe("assigned_only");
    expect(settings.followUpMonths).toBe(12);
    expect("legacy" in settings).toBe(false);
  });

  it("rejects invalid values instead of silently defaulting", () => {
    expect(() => parseClinicSettings({ patientVisibility: "everyone" })).toThrow();
    expect(() => parseClinicSettings({ smsSenderName: "שם בעברית" })).toThrow();
  });

  it("refuses settings written by a newer version of the code", () => {
    expect(() => parseClinicSettings({ version: CLINIC_SETTINGS_VERSION + 1 })).toThrow(/newer/);
  });

  it("treats an object without a version as version 1, so future migrations still run", () => {
    const toV2 = (s: Record<string, unknown>) => ({ ...s, renamed: s.old, version: 2 });
    expect(migrateSettings({ old: "x" }, 2, { 1: toV2 })).toEqual({ old: "x", renamed: "x", version: 2 });
    expect(migrateSettings({}, 2, { 1: toV2 })).toMatchObject({ version: 2 });
    expect(() => migrateSettings({}, 3, { 1: toV2 })).toThrow(/from version 2/);
  });

  it("treats unknown feature flags as off", () => {
    const settings = parseClinicSettings({ featureFlags: { collage: true } });
    expect(isFeatureEnabled(settings, "collage")).toBe(true);
    expect(isFeatureEnabled(settings, "timelapse")).toBe(false);
  });
});
