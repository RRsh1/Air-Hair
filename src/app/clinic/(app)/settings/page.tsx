import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { canStaff } from "@/lib/authz/policy";
import { listBranchesWithCounts } from "@/lib/branches/branches";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { BranchList } from "./branch-list";
import { GeneralForm } from "./general-form";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 md:px-10 md:pt-10">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">הגדרות</h1>
      <Suspense fallback={<div className="mt-8 h-96 rounded-lg bg-line/30" aria-hidden="true" />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  const context = await getStaffContext();
  if (!canStaff(context.actor, "settings.manage", context.settings)) redirect("/clinic/patients");
  const branches = await listBranchesWithCounts(getDb(), context.actor.clinicId);
  return (
    <>
      <section aria-labelledby="general-title" className="mt-8">
        <h2 id="general-title" className="text-[1.25rem] font-semibold">
          המרפאה
        </h2>
        <GeneralForm
          name={context.staff.clinicName}
          smsSenderName={context.settings.smsSenderName ?? ""}
          followUpMonths={context.settings.followUpMonths}
          structuralChangesApplyTo={context.settings.structuralChangesApplyTo}
        />
      </section>
      <section aria-labelledby="branches-title" className="mt-12">
        <h2 id="branches-title" className="text-[1.25rem] font-semibold">
          סניפים
        </h2>
        <p className="mt-1 max-w-[60ch] text-[0.9375rem] text-slate">
          כל טיפול שייך לסניף. הסניף הראשי מקבל טיפולים חדשים כברירת מחדל, וממנו יופקו הדוחות של כל הארגון.
        </p>
        <BranchList branches={branches} />
      </section>
    </>
  );
}
