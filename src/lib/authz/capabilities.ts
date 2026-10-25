import type { ClinicSettings } from "@/lib/clinic-settings/schema";

/**
 * Capabilities are the unit of permission. A role is just a set of capabilities,
 * so new roles (e.g. a receptionist) can be added as data without code changes.
 *
 * Visibility is a capability too: `patient.view` lets you open patients you can see,
 * `patient.view_all` widens what you can see from "assigned to me" to "the whole clinic".
 */
export const capabilities = [
  "patient.view",
  "patient.view_all",
  "patient.create",
  "patient.edit",
  "patient.delete",
  "patient.assign",
  "treatment.mark_performed",
  "timeline.edit",
  "settings.manage",
  "branding.manage",
  "legal.manage",
  "staff.manage",
  "audit.view",
] as const;

export type Capability = (typeof capabilities)[number];

export function isCapability(value: string): value is Capability {
  return (capabilities as readonly string[]).includes(value);
}

export type SystemRole = "admin" | "doctor";

const DOCTOR_BASE: readonly Capability[] = ["patient.view", "patient.edit", "treatment.mark_performed"];

/** Capabilities of a system role under the clinic's current settings. */
export function systemRoleCapabilities(role: SystemRole, settings: ClinicSettings): Set<Capability> {
  if (role === "admin") {
    const set = new Set<Capability>(capabilities);
    if (settings.patientCreation === "doctors_only") set.delete("patient.create");
    return set;
  }

  const set = new Set<Capability>(DOCTOR_BASE);
  if (settings.patientVisibility === "clinic_wide") set.add("patient.view_all");
  if (settings.timelineEditing === "admins_and_doctors") set.add("timeline.edit");
  if (settings.patientCreation !== "admins_only") set.add("patient.create");
  return set;
}

/**
 * Custom roles keep the capabilities stored on them, but clinic-wide restrictions still win:
 * a clinic that set "admins only" for timeline editing or patient creation means it for everyone.
 */
export function customRoleCapabilities(stored: readonly string[], settings: ClinicSettings): Set<Capability> {
  const set = new Set(stored.filter(isCapability));
  if (settings.timelineEditing === "admins_only") set.delete("timeline.edit");
  if (settings.patientCreation !== "admins_and_doctors") set.delete("patient.create");
  return set;
}
