import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase, testKeyring } from "../../../test/db";
import { staffUsers } from "../../db/schema";
import type { Database } from "../../db/types";
import { buildAuth, type Auth } from "../auth/build-auth";
import { loadStaffByAuthUser, resolveStaffAccess } from "../auth/staff-access";
import { createBranch } from "../branches/branches";
import { listPatients } from "../clinic-patients/patients";
import { provisionClinic } from "../clinic/provision";
import { createPatient } from "../patients/create-patient";
import { inviteStaff, listStaff, pendingInviteEmail, setStaffActive, updateStaff } from "./manage";

const keyring = testKeyring();
let db: Database;
let auth: Auth;
let clinicId = "";
let adminId = "";
let mainBranch = "";
let northBranch = "";
const sent: string[] = [];
const sendLink = async (email: string) => void sent.push(email);

beforeAll(async () => {
  db = await testDatabase();
  auth = buildAuth(db, { secret: "test-secret-test-secret-test-secret-0", baseURL: "http://localhost:3000", secureCookies: false, sendPasswordLink: async () => {} });
  const clinic = await provisionClinic(db, auth, { clinicName: "מרפאה", slug: "staff-manage", adminEmail: "boss@test.com", adminName: "מנהלת" });
  clinicId = clinic.clinicId;
  adminId = clinic.staffId;
  mainBranch = clinic.branchId;
  const north = await createBranch(db, { clinicId, name: "סניף צפון" });
  if (north.status !== "created") throw new Error("branch");
  northBranch = north.branchId;
}, 60_000);

describe("inviting staff", () => {
  it("creates the account with its branches and sends the password link", async () => {
    const result = await inviteStaff(db, auth, {
      clinicId,
      email: " Nurse@Test.com ",
      fullName: "רונית  לוי",
      manager: false,
      allBranches: false,
      branchIds: [northBranch],
      invitedBy: adminId,
      sendLink,
    });
    expect(result.status).toBe("invited");
    expect(sent).toEqual(["nurse@test.com"]);
    const nurse = (await listStaff(db, clinicId)).find((s) => s.email === "nurse@test.com")!;
    expect(nurse).toMatchObject({ fullName: "רונית לוי", role: "doctor", allBranches: false, branchIds: [northBranch], activated: false, disabled: false });
    expect(await pendingInviteEmail(db, clinicId, nurse.id)).toBe("nurse@test.com");
  });

  it("refuses a taken email, bad input and branches of nowhere", async () => {
    const base = { clinicId, fullName: "שם", manager: false, allBranches: true, branchIds: [], invitedBy: adminId, sendLink };
    expect(await inviteStaff(db, auth, { ...base, email: "nurse@test.com" })).toEqual({ status: "email_taken" });
    expect(await inviteStaff(db, auth, { ...base, email: "not-an-email" })).toEqual({ status: "invalid", field: "email" });
    expect(await inviteStaff(db, auth, { ...base, email: "a@test.com", fullName: "א" })).toEqual({ status: "invalid", field: "fullName" });
    expect(await inviteStaff(db, auth, { ...base, email: "b@test.com", allBranches: false, branchIds: [] })).toEqual({ status: "invalid", field: "branches" });
    expect(await inviteStaff(db, auth, { ...base, email: "c@test.com", allBranches: false, branchIds: ["00000000-0000-0000-0000-000000000000"] })).toEqual({
      status: "invalid",
      field: "branches",
    });
  });
});

describe("branch assignment reaches the access policy", () => {
  it("shows a branch member only the patients treated in their branches", async () => {
    await createPatient(db, { clinicId, fullName: "דנה כהן", nationalId: "123456782", phone: "0501234567", plannedSurgeryDate: "2026-12-01", branchId: mainBranch }, keyring);
    await createPatient(db, { clinicId, fullName: "רון לוי", nationalId: "000000018", phone: "0527654321", plannedSurgeryDate: "2026-12-01", branchId: northBranch }, keyring);

    const [nurse] = await db.select().from(staffUsers).where(eq(staffUsers.email, "nurse@test.com"));
    const record = await loadStaffByAuthUser(db, nurse.authUserId!);
    expect(record?.branchIds).toEqual([northBranch]);
    const access = resolveStaffAccess({ id: nurse.authUserId!, email: nurse.email, twoFactorEnabled: true }, record);
    if (access.state !== "ok") throw new Error(access.state);
    const visible = await listPatients(db, { actor: access.actor, settings: record!.settings, keyring }, { status: "all" });
    expect(visible.map((p) => p.fullName)).toEqual(["רון לוי"]);
  });
});

describe("managing staff", () => {
  it("edits name, manager level and branches", async () => {
    const nurse = (await listStaff(db, clinicId)).find((s) => s.email === "nurse@test.com")!;
    expect(await updateStaff(db, { clinicId, staffId: nurse.id, actorStaffId: adminId, fullName: "רונית לוי", manager: false, allBranches: true, branchIds: [] })).toEqual({
      status: "saved",
    });
    expect((await listStaff(db, clinicId)).find((s) => s.id === nurse.id)).toMatchObject({ allBranches: true, branchIds: [] });
  });

  it("keeps one active manager with every branch, and never lets managers demote or disable themselves", async () => {
    const self = { clinicId, staffId: adminId, actorStaffId: adminId, fullName: "מנהלת", allBranches: true, branchIds: [] };
    expect(await updateStaff(db, { ...self, manager: false })).toEqual({ status: "self" });
    expect(await setStaffActive(db, auth, { clinicId, staffId: adminId, active: false, actorStaffId: adminId })).toEqual({ status: "self" });

    const nurse = (await listStaff(db, clinicId)).find((s) => s.email === "nurse@test.com")!;
    // Another manager acting on the only full manager.
    expect(await setStaffActive(db, auth, { clinicId, staffId: adminId, active: false, actorStaffId: nurse.id })).toEqual({ status: "last_admin" });
    expect(await updateStaff(db, { ...self, actorStaffId: nurse.id, manager: false })).toEqual({ status: "last_admin" });

    // With a second full manager, the first can be disabled, and enabled again.
    await updateStaff(db, { clinicId, staffId: nurse.id, actorStaffId: adminId, fullName: "רונית לוי", manager: true, allBranches: true, branchIds: [] });
    expect(await setStaffActive(db, auth, { clinicId, staffId: adminId, active: false, actorStaffId: nurse.id })).toEqual({ status: "saved" });
    expect((await listStaff(db, clinicId)).find((s) => s.id === adminId)?.disabled).toBe(true);
    expect(await setStaffActive(db, auth, { clinicId, staffId: adminId, active: true, actorStaffId: nurse.id })).toEqual({ status: "saved" });
  });

  it("can't touch another clinic's staff", async () => {
    expect(await setStaffActive(db, auth, { clinicId: "00000000-0000-0000-0000-000000000000", staffId: adminId, active: false, actorStaffId: adminId })).toEqual({
      status: "not_found",
    });
  });
});
