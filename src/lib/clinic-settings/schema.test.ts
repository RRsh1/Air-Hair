import { describe, expect, it } from "vitest";
import { CLINIC_SETTINGS_VERSION, defaultClinicSettings, isFeatureEnabled, parseClinicSettings } from "./schema";

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

  it("treats unknown feature flags as off", () => {
    const settings = parseClinicSettings({ featureFlags: { collage: true } });
    expect(isFeatureEnabled(settings, "collage")).toBe(true);
    expect(isFeatureEnabled(settings, "timelapse")).toBe(false);
  });
});
