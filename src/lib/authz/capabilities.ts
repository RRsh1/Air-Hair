import type { ClinicSettings } from "@/lib/clinic-settings/schema";

/**
 * Capabilities are the unit of permission. Access decisions never look at a role's name;
 * they ask whether the actor holds a capability.
 *
 * Visibility is a capability too: `patient.view` lets you open patients you can see,
 * `patient.view_all` widens what you can see from "assigned to me" to "the whole clinic".
 *
 * Adding a role later (e.g. a receptionist with fewer rights):
 *  1. add it to `staffRoles` below and to the `staff_role` enum in src/db/schema.ts (+ migration),
 *  2. add its case to `roleCapabilities`.
 * Nothing else changes: policy.ts, screens and queries only see capabilities.
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

export const staffRoles = ["admin", "doctor"] as const;
export type StaffRole = (typeof staffRoles)[number];

const DOCTOR_BASE: readonly Capability[] = ["patient.view", "patient.edit", "treatment.mark_performed"];

/** Capabilities of a role under the clinic's current settings. */
export function roleCapabilities(role: StaffRole, settings: ClinicSettings): Set<Capability> {
  switch (role) {
    case "admin": {
      const set = new Set<Capability>(capabilities);
      if (settings.patientCreation === "doctors_only") set.delete("patient.create");
      return set;
    }
    case "doctor": {
      const set = new Set<Capability>(DOCTOR_BASE);
      if (settings.patientVisibility === "clinic_wide") set.add("patient.view_all");
      if (settings.timelineEditing === "admins_and_doctors") set.add("timeline.edit");
      if (settings.patientCreation !== "admins_only") set.add("patient.create");
      return set;
    }
  }
}
