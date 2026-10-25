import { describe, expect, it } from "vitest";
import { parseClinicSettings } from "@/lib/clinic-settings/schema";
import { canAccessPatient, canStaff, patientScope, type PatientActor, type StaffActor } from "./policy";

const clinicWide = parseClinicSettings({});
const assignedOnly = parseClinicSettings({ patientVisibility: "assigned_only" });

const admin: StaffActor = { kind: "staff", staffId: "admin-1", clinicId: "c1", role: "admin" };
const drCohen: StaffActor = { kind: "staff", staffId: "dr-cohen", clinicId: "c1", role: "doctor" };
const drLevi: StaffActor = { kind: "staff", staffId: "dr-levi", clinicId: "c1", role: "doctor" };
const patientSelf: PatientActor = { kind: "patient", patientId: "p1", clinicId: "c1" };

const p1 = { clinicId: "c1", patientId: "p1", assignedStaffIds: ["dr-cohen"] };
const otherClinic = { clinicId: "c2", patientId: "p9", assignedStaffIds: ["dr-cohen"] };

describe("patient visibility modes", () => {
  it("clinic_wide: every doctor sees every patient", () => {
    expect(canAccessPatient(drCohen, "patient.view", p1, clinicWide)).toBe(true);
    expect(canAccessPatient(drLevi, "patient.view", p1, clinicWide)).toBe(true);
    expect(patientScope(drLevi, clinicWide)).toEqual({ kind: "clinic", clinicId: "c1" });
  });

  it("assigned_only: doctors see only their patients, admins still see all", () => {
    expect(canAccessPatient(drCohen, "patient.view", p1, assignedOnly)).toBe(true);
    expect(canAccessPatient(drLevi, "patient.view", p1, assignedOnly)).toBe(false);
    expect(canAccessPatient(admin, "patient.view", p1, assignedOnly)).toBe(true);
    expect(patientScope(drLevi, assignedOnly)).toEqual({ kind: "assigned", clinicId: "c1", staffId: "dr-levi" });
    expect(patientScope(admin, assignedOnly)).toEqual({ kind: "clinic", clinicId: "c1" });
  });

  it("never crosses clinics, whatever the mode or role", () => {
    expect(canAccessPatient(admin, "patient.view", otherClinic, clinicWide)).toBe(false);
    expect(canAccessPatient(drCohen, "patient.view", otherClinic, clinicWide)).toBe(false);
    expect(canAccessPatient({ ...patientSelf, clinicId: "c2" }, "patient.view", p1, clinicWide)).toBe(false);
  });
});

describe("capabilities from settings", () => {
  it("only admins delete patients", () => {
    expect(canAccessPatient(admin, "patient.delete", p1, clinicWide)).toBe(true);
    expect(canAccessPatient(drCohen, "patient.delete", p1, clinicWide)).toBe(false);
  });

  it("timeline editing follows the clinic setting", () => {
    expect(canStaff(drCohen, "timeline.edit", clinicWide)).toBe(true);
    expect(canStaff(drCohen, "timeline.edit", parseClinicSettings({ timelineEditing: "admins_only" }))).toBe(false);
    expect(canStaff(admin, "timeline.edit", parseClinicSettings({ timelineEditing: "admins_only" }))).toBe(true);
  });

  it("patient creation follows the clinic setting", () => {
    const adminsOnly = parseClinicSettings({ patientCreation: "admins_only" });
    const doctorsOnly = parseClinicSettings({ patientCreation: "doctors_only" });
    expect(canStaff(drCohen, "patient.create", adminsOnly)).toBe(false);
    expect(canStaff(admin, "patient.create", adminsOnly)).toBe(true);
    expect(canStaff(admin, "patient.create", doctorsOnly)).toBe(false);
    expect(canStaff(drCohen, "patient.create", doctorsOnly)).toBe(true);
  });

  it("disabled staff lose every capability", () => {
    const disabledAdmin: StaffActor = { ...admin, disabled: true };
    expect(canStaff(disabledAdmin, "settings.manage", clinicWide)).toBe(false);
    expect(canAccessPatient(disabledAdmin, "patient.view", p1, clinicWide)).toBe(false);
    expect(patientScope(disabledAdmin, clinicWide)).toEqual({ kind: "none" });
  });
});

describe("patients", () => {
  it("can view only themselves and have no staff capabilities", () => {
    expect(canAccessPatient(patientSelf, "patient.view", p1, clinicWide)).toBe(true);
    expect(canAccessPatient(patientSelf, "patient.view", { ...p1, patientId: "p2" }, clinicWide)).toBe(false);
    expect(canAccessPatient(patientSelf, "patient.edit", p1, clinicWide)).toBe(false);
    expect(canStaff(patientSelf, "patient.view", clinicWide)).toBe(false);
    expect(patientScope(patientSelf, clinicWide)).toEqual({ kind: "self", clinicId: "c1", patientId: "p1" });
  });
});
