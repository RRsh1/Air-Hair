import type { ClinicSettings } from "@/lib/clinic-settings/schema";
import { systemRoleCapabilities, type Capability, type SystemRole } from "./capabilities";

/**
 * The single place where access decisions are made. Screens, server actions and
 * route handlers call can() / patientScope(); none of them checks roles directly.
 * Postgres Row Level Security on clinic_id is the second line of defence.
 */

export type StaffActor = {
  kind: "staff";
  staffId: string;
  clinicId: string;
  role: SystemRole;
  /** Set for custom roles; overrides the system-role derivation. */
  customCapabilities?: readonly Capability[];
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

export function staffCapabilities(actor: StaffActor, settings: ClinicSettings): ReadonlySet<Capability> {
  return actor.customCapabilities ? new Set(actor.customCapabilities) : systemRoleCapabilities(actor.role, settings);
}

/** Admins, and anyone in clinic_wide mode, see every patient; otherwise only assigned ones. */
function seesWholeClinic(actor: StaffActor, settings: ClinicSettings): boolean {
  return actor.role === "admin" || settings.patientVisibility === "clinic_wide";
}

/** Clinic-level actions that are not about one patient. */
export function canStaff(actor: Actor, capability: Capability, settings: ClinicSettings): boolean {
  return actor.kind === "staff" && staffCapabilities(actor, settings).has(capability);
}

/** Actions on one patient's data: viewing, editing, journal, photos, consents. */
export function canAccessPatient(
  actor: Actor,
  capability: Extract<Capability, `patient.${string}` | "treatment.mark_performed">,
  patient: PatientRef,
  settings: ClinicSettings,
): boolean {
  if (actor.clinicId !== patient.clinicId) return false;

  if (actor.kind === "patient") {
    // Patients only ever read their own record; writes go through dedicated journal actions.
    return capability === "patient.view" && actor.patientId === patient.patientId;
  }

  if (!staffCapabilities(actor, settings).has(capability)) return false;
  return seesWholeClinic(actor, settings) || patient.assignedStaffIds.includes(actor.staffId);
}

/**
 * Filter for patient list queries. The data layer turns this into a WHERE clause,
 * so switching visibility modes changes filtering only and never touches data.
 */
export type PatientScope =
  | { kind: "clinic"; clinicId: string }
  | { kind: "assigned"; clinicId: string; staffId: string }
  | { kind: "self"; clinicId: string; patientId: string };

export function patientScope(actor: Actor, settings: ClinicSettings): PatientScope {
  if (actor.kind === "patient") return { kind: "self", clinicId: actor.clinicId, patientId: actor.patientId };
  if (seesWholeClinic(actor, settings)) return { kind: "clinic", clinicId: actor.clinicId };
  return { kind: "assigned", clinicId: actor.clinicId, staffId: actor.staffId };
}
