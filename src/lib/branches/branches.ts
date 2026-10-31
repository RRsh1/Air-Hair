import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { branches } from "../../db/schema";
import type { Database } from "../../db/types";

/**
 * Branches of a clinic (the organization). Every clinic has exactly one main branch, created with
 * the clinic; it runs organization-wide reports and is the default for new treatments.
 */

export type Branch = { id: string; name: string; isMain: boolean };

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
