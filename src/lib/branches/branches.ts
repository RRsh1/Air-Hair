import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { branches, treatments } from "../../db/schema";
import type { Database } from "../../db/types";

/**
 * Branches of a clinic (the organization). Every clinic has exactly one main branch, created with
 * the clinic; it runs organization-wide reports and is the default for new treatments.
 */

export type Branch = { id: string; name: string; isMain: boolean };
export type BranchWithCounts = Branch & { activeTreatments: number };

export async function listBranches(db: Database, clinicId: string): Promise<Branch[]> {
  return db
    .select({ id: branches.id, name: branches.name, isMain: branches.isMain })
    .from(branches)
    .where(and(eq(branches.clinicId, clinicId), isNull(branches.archivedAt)))
    .orderBy(desc(branches.isMain), asc(branches.createdAt));
}

export async function mainBranchId(db: Database, clinicId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.clinicId, clinicId), eq(branches.isMain, true)))
    .limit(1);
  return row?.id ?? null;
}

/** An active branch of this clinic, or null (unknown, archived, or another clinic's). */
export async function activeBranchId(db: Database, clinicId: string, branchId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/.test(branchId)) return null;
  const [row] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.clinicId, clinicId), isNull(branches.archivedAt)))
    .limit(1);
  return row?.id ?? null;
}

export type CreateBranchResult = { status: "created"; branchId: string } | { status: "invalid" };

export async function createBranch(db: Database, input: { clinicId: string; name: string }): Promise<CreateBranchResult> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { status: "invalid" };
  const [row] = await db.insert(branches).values({ clinicId: input.clinicId, name }).returning({ id: branches.id });
  return { status: "created", branchId: row.id };
}

/** Active branches with how many active treatments each has (for the settings screen). */
export async function listBranchesWithCounts(db: Database, clinicId: string): Promise<BranchWithCounts[]> {
  const [list, counts] = await Promise.all([
    listBranches(db, clinicId),
    db
      .select({ branchId: treatments.branchId, n: count() })
      .from(treatments)
      .where(and(eq(treatments.clinicId, clinicId), inArray(treatments.status, ["scheduled", "performed"])))
      .groupBy(treatments.branchId),
  ]);
  const byBranch = new Map(counts.map((c) => [c.branchId, Number(c.n)]));
  return list.map((b) => ({ ...b, activeTreatments: byBranch.get(b.id) ?? 0 }));
}

export async function renameBranch(db: Database, input: { clinicId: string; branchId: string; name: string }): Promise<"saved" | "invalid" | "not_found"> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return "invalid";
  const id = await activeBranchId(db, input.clinicId, input.branchId);
  if (!id) return "not_found";
  await db.update(branches).set({ name }).where(and(eq(branches.id, id), eq(branches.clinicId, input.clinicId)));
  return "saved";
}

/**
 * Archives a branch: it leaves lists and pickers, its treatments and history stay. The main branch
 * can't be archived, nor a branch with active treatments (move or finish them first).
 */
export async function archiveBranch(
  db: Database,
  input: { clinicId: string; branchId: string; now?: Date },
): Promise<"archived" | "main" | "has_active" | "not_found"> {
  const [row] = await db
    .select({ id: branches.id, isMain: branches.isMain })
    .from(branches)
    .where(and(eq(branches.id, input.branchId), eq(branches.clinicId, input.clinicId), isNull(branches.archivedAt)))
    .limit(1);
  if (!row) return "not_found";
  if (row.isMain) return "main";
  const [active] = await db
    .select({ id: treatments.id })
    .from(treatments)
    .where(and(eq(treatments.branchId, row.id), inArray(treatments.status, ["scheduled", "performed"])))
    .limit(1);
  if (active) return "has_active";
  await db.update(branches).set({ archivedAt: input.now ?? new Date() }).where(eq(branches.id, row.id));
  return "archived";
}

/** The branches a staff member may choose (all, or those assigned to them). */
export function branchesFor<T extends { id: string }>(branches: T[], actorBranchIds: readonly string[] | null | undefined): T[] {
  return actorBranchIds ? branches.filter((b) => actorBranchIds.includes(b.id)) : branches;
}
