import type { ClinicSettings } from "@/lib/clinic-settings/schema";
import { roleCapabilities, type Capability, type StaffRole } from "./capabilities";

/**
 * The single place where access decisions are made. Screens, server actions and
 * route handlers call canStaff() / canAccessPatient() / patientScope(); none of them
 * checks roles directly, and neither does this file — every decision is a capability.
 * Postgres Row Level Security on clinic_id is the second line of defence.
 */

export type StaffActor = {
  kind: "staff";
  staffId: string;
  clinicId: string;
  role: StaffRole;
  disabled?: boolean;
};

export type PatientActor = {
  kind: "patient";
  patientId: string;
  clinicId: string;
};

export type Actor = StaffActor | PatientActor;

export type PatientRef = {
  clinicId: string;
  patientId: string;
  assignedStaffIds: readonly string[];
};

const NONE: ReadonlySet<Capability> = new Set();

export function staffCapabilities(actor: StaffActor, settings: ClinicSettings): ReadonlySet<Capability> {
  return actor.disabled ? NONE : roleCapabilities(actor.role, settings);
}

/** Clinic-level actions that are not about one patient. */
export function canStaff(actor: Actor, capability: Capability, settings: ClinicSettings): boolean {
  return actor.kind === "staff" && staffCapabilities(actor, settings).has(capability);
}

type PatientCapability = Extract<Capability, "patient.view" | "patient.edit" | "patient.delete" | "patient.assign" | "treatment.mark_performed">;

/** Actions on one patient's data: viewing, editing, journal, photos, consents. */
export function canAccessPatient(
  actor: Actor,
  capability: PatientCapability,
  patient: PatientRef,
  settings: ClinicSettings,
): boolean {
  if (actor.clinicId !== patient.clinicId) return false;

  if (actor.kind === "patient") {
    // Patients only ever read their own record; writes go through dedicated journal actions.
    return capability === "patient.view" && actor.patientId === patient.patientId;
  }

  const caps = staffCapabilities(actor, settings);
  if (!caps.has(capability) || !caps.has("patient.view")) return false;
  return caps.has("patient.view_all") || patient.assignedStaffIds.includes(actor.staffId);
}

/**
 * Filter for patient list queries. The data layer turns this into a WHERE clause
 * ("none" → WHERE false), so switching visibility modes changes filtering only.
 */
export type PatientScope =
  | { kind: "none" }
  | { kind: "clinic"; clinicId: string }
  | { kind: "assigned"; clinicId: string; staffId: string }
  | { kind: "self"; clinicId: string; patientId: string };

export function patientScope(actor: Actor, settings: ClinicSettings): PatientScope {
  if (actor.kind === "patient") return { kind: "self", clinicId: actor.clinicId, patientId: actor.patientId };

  const caps = staffCapabilities(actor, settings);
  if (!caps.has("patient.view")) return { kind: "none" };
  if (caps.has("patient.view_all")) return { kind: "clinic", clinicId: actor.clinicId };
  return { kind: "assigned", clinicId: actor.clinicId, staffId: actor.staffId };
}
