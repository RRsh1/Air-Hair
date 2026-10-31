import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { procedureOptions } from "@/components/clinic/procedure-options";
import { getDb } from "@/db/client";
import { canStaff } from "@/lib/authz/policy";
import { branchesFor, listBranches } from "@/lib/branches/branches";
import { listClinicProcedures, listLibrary } from "@/lib/catalog/procedures";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { NewPatientForm } from "./new-patient-form";

export default function NewPatientPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 md:px-10 md:pt-10">
      <Link href="/clinic/patients" className="text-[0.9375rem] font-medium text-petrol">
        כל המטופלים
      </Link>
      <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-tight">מטופל חדש</h1>
      <p className="mt-2 max-w-[60ch] text-[1rem] text-slate">
        אחרי יצירת הכרטיס המטופל נכנס לאפליקציה עם תעודת הזהות והנייד, וקוד שמגיע בהודעה.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 rounded-lg bg-line/30" aria-hidden="true" />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const context = await getStaffContext();
  if (!canStaff(context.actor, "patient.create", context.settings)) redirect("/clinic/patients");
  const db = getDb();
  const [branches, procedures, library] = await Promise.all([
    listBranches(db, context.actor.clinicId).then((all) => branchesFor(all, context.actor.branchIds)),
    listClinicProcedures(db, context.actor.clinicId),
    listLibrary(db),
  ]);
  return <NewPatientForm branches={branches} procedures={procedureOptions(procedures, library)} />;
}
