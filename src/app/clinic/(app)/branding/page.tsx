import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { clinics } from "@/db/schema";
import { canStaff } from "@/lib/authz/policy";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { loadClinicBranding } from "@/lib/theme/branding";
import { parsePatientTheme } from "@/lib/theme/patient-theme";
import { themePresets } from "@/lib/theme/presets";
import { BrandingEditor } from "./editor";

export default function BrandingPage() {
  return (
    <div className="mx-auto w-full max-w-[90rem] px-5 pb-16 pt-8 md:px-10 md:pt-10">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">מיתוג</h1>
      <p className="mt-2 max-w-[62ch] text-[1rem] text-slate">
        העיצוב של אפליקציית המטופל: צבעים, גופנים, תצוגה של כל חלק במסך והלוגו. השינויים מופיעים בתצוגה מיד, ומגיעים למטופלים רק אחרי פרסום.
      </p>
      <Suspense fallback={<div className="mt-8 h-[44rem] rounded-lg bg-line/30" aria-hidden="true" />}>
        <Editor />
      </Suspense>
    </div>
  );
}

async function Editor() {
  const context = await getStaffContext();
  if (!canStaff(context.actor, "branding.manage", context.settings)) redirect("/clinic/patients");
  const db = getDb();
  const [branding, [clinic]] = await Promise.all([
    loadClinicBranding(db, context.actor.clinicId),
    db.select({ slug: clinics.slug }).from(clinics).where(eq(clinics.id, context.actor.clinicId)),
  ]);
  const presets = Object.entries(themePresets).map(([id, preset]) => ({ id, label: preset.label, theme: parsePatientTheme(preset.tokens) }));
  return (
    <div className="mt-8">
      <BrandingEditor published={branding.theme} presets={presets} clinicName={context.staff.clinicName} slug={clinic.slug} logoId={branding.logoId} />
    </div>
  );
}
