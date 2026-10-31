import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { user as authUser } from "../../db/auth-schema";
import { auditLog, branches, staffBranches, staffUsers } from "../../db/schema";
import type { Database } from "../../db/types";
import type { Auth } from "../auth/build-auth";
import type { StaffRole } from "../authz/capabilities";
import { disableStaff, enableStaff } from "./disable-staff";

/**
 * The clinic's staff accounts, managed by its admins.
 *
 * One permission level for patient work (role "doctor" in the data, "צוות" on screen) and a manager
 * level (role "admin": staff, settings, branding, documents). Each staff member works in every
 * branch or in assigned ones; the access policy limits what a branch-assigned member sees.
 *
 * Invariants: a clinic always keeps at least one active admin with access to every branch, and a
 * manager can't demote, restrict or disable themselves (another admin has to).
 */

export type StaffMember = {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  allBranches: boolean;
  branchIds: string[];
  disabled: boolean;
  /** Finished setting up the account (password and two-step verification). */
  activated: boolean;
  createdAt: Date;
};

export async function listStaff(db: Database, clinicId: string): Promise<StaffMember[]> {
  const [rows, assignments] = await Promise.all([
    db
      .select({
        id: staffUsers.id,
        fullName: staffUsers.fullName,
        email: staffUsers.email,
        role: staffUsers.role,
        allBranches: staffUsers.allBranches,
        disabledAt: staffUsers.disabledAt,
        createdAt: staffUsers.createdAt,
        twoFactor: authUser.twoFactorEnabled,
      })
      .from(staffUsers)
      .leftJoin(authUser, eq(authUser.id, staffUsers.authUserId))
      .where(eq(staffUsers.clinicId, clinicId))
      .orderBy(asc(staffUsers.disabledAt), asc(staffUsers.createdAt)),
    db.select({ staffId: staffBranches.staffId, branchId: staffBranches.branchId }).from(staffBranches).where(eq(staffBranches.clinicId, clinicId)),
  ]);
  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    allBranches: row.allBranches,
    branchIds: assignments.filter((a) => a.staffId === row.id).map((a) => a.branchId),
    disabled: row.disabledAt !== null,
    activated: row.twoFactor === true,
    createdAt: row.createdAt,
  }));
}

export type StaffInput = {
  fullName: string;
  manager: boolean;
  /** Ignored for managers, who always work in every branch. */
  allBranches: boolean;
  branchIds: string[];
};

type Invalid = { status: "invalid"; field: "fullName" | "email" | "branches" };

async function checkInput(db: Database, clinicId: string, input: StaffInput): Promise<Invalid | { status: "ok"; fullName: string; allBranches: boolean; branchIds: string[] }> {
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (fullName.length < 2 || fullName.length > 80) return { status: "invalid", field: "fullName" };
  const allBranches = input.manager || input.allBranches;
  if (allBranches) return { status: "ok", fullName, allBranches, branchIds: [] };
  const wanted = [...new Set(input.branchIds)];
  const valid =
    wanted.length === 0
      ? []
      : await db
          .select({ id: branches.id })
          .from(branches)
          .where(and(eq(branches.clinicId, clinicId), inArray(branches.id, wanted), isNull(branches.archivedAt)));
  if (valid.length === 0 || valid.length !== wanted.length) return { status: "invalid", field: "branches" };
  return { status: "ok", fullName, allBranches, branchIds: wanted };
}

export type InviteResult = { status: "invited"; staffId: string } | Invalid | { status: "email_taken" };

/**
 * Creates a staff account and sends the "set your password" link. The account gets a random
 * password nobody sees; the new member sets their own and then enrolls two-step verification.
 */
export async function inviteStaff(
  db: Database,
  auth: Auth,
  input: StaffInput & { clinicId: string; email: string; invitedBy: string; sendLink: (email: string) => Promise<void> },
): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { status: "invalid", field: "email" };
  const checked = await checkInput(db, input.clinicId, input);
  if (checked.status === "invalid") return checked;

  const [taken] = await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, email)).limit(1);
  if (taken) return { status: "email_taken" };

  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser({ email, name: checked.fullName, emailVerified: true }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await ctx.password.hash(randomBytes(32).toString("base64url")),
  });

  const staffId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(staffUsers)
      .values({
        clinicId: input.clinicId,
        role: input.manager ? "admin" : "doctor",
        email,
        fullName: checked.fullName,
        authUserId: created.id,
        allBranches: checked.allBranches,
      })
      .returning({ id: staffUsers.id });
    if (checked.branchIds.length > 0) {
      await tx.insert(staffBranches).values(checked.branchIds.map((branchId) => ({ clinicId: input.clinicId, staffId: row.id, branchId })));
    }
    await tx.insert(auditLog).values({
      clinicId: input.clinicId,
      actorKind: "staff",
      actorId: input.invitedBy,
      action: "staff.invite",
      metadata: { staffId: row.id, manager: input.manager, branches: checked.allBranches ? "all" : checked.branchIds.length },
    });
    return row.id;
  });
  await input.sendLink(email);
  return { status: "invited", staffId };
}

export type UpdateResult = { status: "saved" } | Invalid | { status: "not_found" } | { status: "self" } | { status: "last_admin" };

/** Changes a member's name, manager level and branches. */
export async function updateStaff(
  db: Database,
  input: StaffInput & { clinicId: string; staffId: string; actorStaffId: string },
): Promise<UpdateResult> {
  const checked = await checkInput(db, input.clinicId, input);
  if (checked.status === "invalid") return checked;
  const [current] = await db
    .select({ role: staffUsers.role, allBranches: staffUsers.allBranches, disabledAt: staffUsers.disabledAt })
    .from(staffUsers)
    .where(and(eq(staffUsers.id, input.staffId), eq(staffUsers.clinicId, input.clinicId)))
    .limit(1);
  if (!current) return { status: "not_found" };

  const losesFullAdmin = current.role === "admin" && (!input.manager || !checked.allBranches);
  if (losesFullAdmin && input.staffId === input.actorStaffId) return { status: "self" };
  if (losesFullAdmin && !current.disabledAt && (await otherFullAdmins(db, input.clinicId, input.staffId)) === 0) return { status: "last_admin" };

  await db.transaction(async (tx) => {
    await tx
      .update(staffUsers)
      .set({ fullName: checked.fullName, role: input.manager ? "admin" : "doctor", allBranches: checked.allBranches })
      .where(eq(staffUsers.id, input.staffId));
    await tx.delete(staffBranches).where(eq(staffBranches.staffId, input.staffId));
    if (checked.branchIds.length > 0) {
      await tx.insert(staffBranches).values(checked.branchIds.map((branchId) => ({ clinicId: input.clinicId, staffId: input.staffId, branchId })));
    }
    await tx.insert(auditLog).values({
      clinicId: input.clinicId,
      actorKind: "staff",
      actorId: input.actorStaffId,
      action: "staff.update",
      metadata: { staffId: input.staffId, manager: input.manager, branches: checked.allBranches ? "all" : checked.branchIds.length },
    });
  });
  return { status: "saved" };
}

export type SetActiveResult = { status: "saved" } | { status: "not_found" } | { status: "self" } | { status: "last_admin" };

/** Disables (sessions revoked at once) or re-enables a member. */
export async function setStaffActive(
  db: Database,
  auth: Auth,
  input: { clinicId: string; staffId: string; active: boolean; actorStaffId: string },
): Promise<SetActiveResult> {
  const [member] = await db
    .select({ role: staffUsers.role, allBranches: staffUsers.allBranches })
    .from(staffUsers)
    .where(and(eq(staffUsers.id, input.staffId), eq(staffUsers.clinicId, input.clinicId)))
    .limit(1);
  if (!member) return { status: "not_found" };
  if (!input.active) {
    if (input.staffId === input.actorStaffId) return { status: "self" };
    if (member.role === "admin" && member.allBranches && (await otherFullAdmins(db, input.clinicId, input.staffId)) === 0) return { status: "last_admin" };
    await disableStaff(db, auth, input.staffId);
  } else {
    await enableStaff(db, input.staffId);
  }
  await db.insert(auditLog).values({
    clinicId: input.clinicId,
    actorKind: "staff",
    actorId: input.actorStaffId,
    action: input.active ? "staff.enable" : "staff.disable",
    metadata: { staffId: input.staffId },
  });
  return { status: "saved" };
}

/** Email of a member who hasn't finished setting up, for sending the link again. */
export async function pendingInviteEmail(db: Database, clinicId: string, staffId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: staffUsers.email, twoFactor: authUser.twoFactorEnabled, disabledAt: staffUsers.disabledAt })
    .from(staffUsers)
    .leftJoin(authUser, eq(authUser.id, staffUsers.authUserId))
    .where(and(eq(staffUsers.id, staffId), eq(staffUsers.clinicId, clinicId)))
    .limit(1);
  return row && !row.twoFactor && !row.disabledAt ? row.email : null;
}

async function otherFullAdmins(db: Database, clinicId: string, exceptStaffId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(staffUsers)
    .where(
      and(
        eq(staffUsers.clinicId, clinicId),
        eq(staffUsers.role, "admin"),
        eq(staffUsers.allBranches, true),
        isNull(staffUsers.disabledAt),
        ne(staffUsers.id, exceptStaffId),
      ),
    );
  return Number(row?.n ?? 0);
}
