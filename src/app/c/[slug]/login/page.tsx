import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getClinic, getPatientContext } from "@/lib/patient-auth/server";
import { PatientLoginForm } from "./login-form";

export default function PatientLoginPage({ params }: PageProps<"/c/[slug]/login">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10 pt-14">
      <Suspense fallback={<div className="h-40" aria-hidden="true" />}>
        <LoginBody params={params} />
      </Suspense>
    </main>
  );
}

async function LoginBody({ params }: Pick<PageProps<"/c/[slug]/login">, "params">) {
  await connection();
  const { slug } = await params;
  const clinic = await getClinic(slug);
  if (!clinic) notFound();
  if (await getPatientContext(slug)) redirect(`/c/${slug}`);

  return (
    <>
      <p className="text-[1rem] font-medium text-p-muted">{clinic.name}</p>
      <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-tight">יומן ההחלמה שלך</h1>
      <p className="mt-3 text-[1.0625rem] leading-relaxed text-p-muted">
        נכנסים עם תעודת הזהות ומספר הנייד שמסרתם במרפאה. נשלח אליכם קוד בהודעה.
      </p>
      <div className="mt-9">
        <PatientLoginForm slug={slug} />
      </div>
      <p className="mt-auto pt-10 text-center">
        <Link href={`/c/${slug}/privacy`} className="text-[0.875rem] text-p-muted underline-offset-4 hover:underline">
          מדיניות הפרטיות של המרפאה
        </Link>
      </p>
    </>
  );
}
