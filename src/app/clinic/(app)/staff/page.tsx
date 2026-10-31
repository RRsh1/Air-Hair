import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { canStaff } from "@/lib/authz/policy";
import { listBranches } from "@/lib/branches/branches";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { listStaff } from "@/lib/staff/manage";
import { StaffList } from "./staff-list";

export default function StaffPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-16 pt-8 md:px-10 md:pt-10">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">צוות</h1>
      <p className="mt-2 max-w-[62ch] text-[1rem] text-slate">
        לכל איש צוות משתמש משלו, כך שיומן הפעולות יודע מי צפה במידע ומי שינה אותו. איש צוות שמשויך לסניפים רואה רק מטופלים שמטופלים בסניפים שלו.
      </p>
      <Suspense fallback={<div className="mt-8 h-80 rounded-lg bg-line/30" aria-hidden="true" />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  const context = await getStaffContext();
  if (!canStaff(context.actor, "staff.manage", context.settings)) redirect("/clinic/patients");
  const db = getDb();
  const [staff, branches] = await Promise.all([listStaff(db, context.actor.clinicId), listBranches(db, context.actor.clinicId)]);
  return <StaffList staff={staff} branches={branches} selfId={context.actor.staffId} />;
}
