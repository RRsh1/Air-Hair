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
  /**
   * The branches this staff member works in; null or absent means every branch. A staff member
   * limited to branches sees and acts on patients with at least one treatment in one of them.
   */
  branchIds?: readonly string[] | null;
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
  /** Branches of the patient's treatments (needed when the actor is limited to branches). */
  branchIds?: readonly string[];
};

/** True when the actor may work with a patient treated in these branches. */
function inActorBranches(actor: StaffActor, branchIds: readonly string[] | undefined): boolean {
  if (!actor.branchIds) return true;
  return (branchIds ?? []).some((id) => actor.branchIds!.includes(id));
}

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
  if (!inActorBranches(actor, patient.branchIds)) return false;
  return caps.has("patient.view_all") || patient.assignedStaffIds.includes(actor.staffId);
}

/**
 * Filter for patient list queries. The data layer turns this into a WHERE clause
 * ("none" → WHERE false), so switching visibility modes changes filtering only.
 */
export type PatientScope =
  | { kind: "none" }
  | { kind: "clinic"; clinicId: string; branchIds?: readonly string[] }
  | { kind: "assigned"; clinicId: string; staffId: string; branchIds?: readonly string[] }
  | { kind: "self"; clinicId: string; patientId: string };

export function patientScope(actor: Actor, settings: ClinicSettings): PatientScope {
  if (actor.kind === "patient") return { kind: "self", clinicId: actor.clinicId, patientId: actor.patientId };

  const caps = staffCapabilities(actor, settings);
  if (!caps.has("patient.view")) return { kind: "none" };
  // Limited to branches: patients with a treatment in one of them (an empty list sees none).
  const branches = actor.branchIds ? { branchIds: actor.branchIds } : {};
  if (caps.has("patient.view_all")) return { kind: "clinic", clinicId: actor.clinicId, ...branches };
  return { kind: "assigned", clinicId: actor.clinicId, staffId: actor.staffId, ...branches };
}
