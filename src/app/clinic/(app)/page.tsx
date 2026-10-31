import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/server";

/** The dashboard opens on the patient register. */
export default function ClinicHome() {
  return (
    <Suspense fallback={null}>
      <Go />
    </Suspense>
  );
}

async function Go(): Promise<null> {
  await requireStaff();
  redirect("/clinic/patients");
  return null;
}
