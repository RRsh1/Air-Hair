import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { clinics } from "@/db/schema";
import { canStaff } from "@/lib/authz/policy";
import { getStaffContext } from "@/lib/clinic-patients/server";
import Link from "next/link";
import { listBranches } from "@/lib/branches/branches";
import { loadBrandingScope } from "@/lib/theme/branding";
import { parsePatientTheme } from "@/lib/theme/patient-theme";
import { themePresets } from "@/lib/theme/presets";
import { BrandingEditor } from "./editor";

export default function BrandingPage({ searchParams }: PageProps<"/clinic/branding">) {
  return (
    <div className="mx-auto w-full max-w-[90rem] px-5 pb-16 pt-8 md:px-10 md:pt-10">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">מיתוג</h1>
      <p className="mt-2 max-w-[62ch] text-[1rem] text-slate">
        העיצוב של אפליקציית המטופל: צבעים, גופנים, תצוגה של כל חלק במסך והלוגו. השינויים מופיעים בתצוגה מיד, ומגיעים למטופלים רק אחרי פרסום.
      </p>
      <Suspense fallback={<div className="mt-8 h-[44rem] rounded-lg bg-line/30" aria-hidden="true" />}>
        <Editor searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Editor({ searchParams }: Pick<PageProps<"/clinic/branding">, "searchParams">) {
  const context = await getStaffContext();
  if (!canStaff(context.actor, "branding.manage", context.settings)) redirect("/clinic/patients");
  const db = getDb();
  const requested = (await searchParams).branch;
  const branches = await listBranches(db, context.actor.clinicId);
  const branch = branches.find((b) => b.id === requested && !b.isMain) ?? null;
  const [scope, [clinic]] = await Promise.all([
    loadBrandingScope(db, context.actor.clinicId, branch?.id ?? null),
    db.select({ slug: clinics.slug }).from(clinics).where(eq(clinics.id, context.actor.clinicId)),
  ]);
  const presets = Object.entries(themePresets).map(([id, preset]) => ({ id, label: preset.label, theme: parsePatientTheme(preset.tokens) }));
  const others = branches.filter((b) => !b.isMain);
  return (
    <div className="mt-6">
      {others.length > 0 && (
        <nav aria-label="של מי המיתוג" className="mb-6 flex flex-wrap items-center gap-1.5">
          <span className="me-2 text-[0.9375rem] text-slate">עורכים את המיתוג של</span>
          {[{ id: "", name: "כל הארגון" }, ...others].map((b) => {
            const current = (branch?.id ?? "") === b.id;
            return (
              <Link
                key={b.id || "org"}
                href={b.id ? `/clinic/branding?branch=${b.id}` : "/clinic/branding"}
                aria-current={current ? "page" : undefined}
                className={`flex h-9 items-center rounded-full border px-3.5 text-[0.9375rem] ${current ? "border-ink font-semibold text-ink" : "border-line text-slate hover:text-ink"}`}
              >
                {b.name}
              </Link>
            );
          })}
        </nav>
      )}
      <BrandingEditor
        key={branch?.id ?? "org"}
        published={scope.theme}
        presets={presets}
        clinicName={context.staff.clinicName}
        slug={clinic.slug}
        logoId={scope.branchLogoId ?? scope.orgLogoId}
        branch={branch ? { id: branch.id, name: branch.name, hasOverride: scope.hasOverride, ownLogo: Boolean(scope.branchLogoId) } : null}
      />
    </div>
  );
}
