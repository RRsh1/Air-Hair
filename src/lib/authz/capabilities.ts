import type { ClinicSettings } from "@/lib/clinic-settings/schema";

/**
 * Capabilities are the unit of permission. A role is just a set of capabilities,
 * so new roles (e.g. a receptionist) can be added as data without code changes.
 */
export const capabilities = [
  "patient.view",
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

export type SystemRole = "admin" | "doctor";

const ADMIN: readonly Capability[] = capabilities;

const DOCTOR_BASE: readonly Capability[] = ["patient.view", "patient.edit", "treatment.mark_performed"];

/**
 * Capabilities of a system role under the clinic's current settings.
 * Custom roles (roles + role_capabilities tables) bypass this and use their stored list.
 */
export function systemRoleCapabilities(role: SystemRole, settings: ClinicSettings): ReadonlySet<Capability> {
  if (role === "admin") {
    const set = new Set<Capability>(ADMIN);
    if (settings.patientCreation === "doctors_only") set.delete("patient.create");
    return set;
  }

  const set = new Set<Capability>(DOCTOR_BASE);
  if (settings.timelineEditing === "admins_and_doctors") set.add("timeline.edit");
  if (settings.patientCreation !== "admins_only") set.add("patient.create");
  return set;
}
