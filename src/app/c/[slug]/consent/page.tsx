import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LegalText } from "@/components/patient/legal-text";
import { PatientHeader } from "@/components/patient/patient-header";
import { getConsentStatus } from "@/lib/legal/server";
import { requirePatient } from "@/lib/patient-auth/server";
import { ConsentForm } from "./consent-form";

/** First screen after login until the patient signs the clinic's current consent document. */
export default function ConsentPage({ params, searchParams }: PageProps<"/c/[slug]/consent">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-hidden="true" />}>
      <ConsentBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ConsentBody({ params, searchParams }: Pick<PageProps<"/c/[slug]/consent">, "params" | "searchParams">) {
  await connection();
  const { slug } = await params;
  const context = await requirePatient(slug);
  const status = await getConsentStatus(context.clinic.id, context.journal.patientId);
  if (!status.required || status.signedAt) redirect(`/c/${slug}`);
  const updated = (await searchParams).updated === "1";
  const { document } = status;

  return (
    <>
      <PatientHeader slug={slug} clinic={context.clinic} />
      <main className="p-page mx-auto w-full max-w-md flex-1 px-5 pb-12 pt-4">
        <p className="text-[1.0625rem] text-p-muted">שלום {context.journal.firstName}</p>
        <h1 className="p-title mt-1 text-[2rem] leading-tight tracking-tight">לפני שמתחילים</h1>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-p-muted">
          {document.version > 1 && !updated
            ? "המרפאה עדכנה את מסמך ההסכמה. קראו את הנוסח החדש וחתמו עליו כדי להמשיך."
            : "קראו את מסמך ההסכמה של המרפאה וחתמו עליו. החתימה נשמרת בתיק שלכם במרפאה."}
        </p>
        {updated && (
          <p role="status" className="mt-4 rounded-p border border-p-accent/30 bg-p-accent/5 px-4 py-3 text-[0.9375rem]">
            המסמך עודכן בזמן שקראתם. זה הנוסח החדש, וצריך לחתום עליו מחדש.
          </p>
        )}

        <section aria-labelledby="consent-title" className="p-block mt-7 py-5">
          <h2 id="consent-title" className="p-heading text-[1.125rem]">
            מסמך הסכמה
          </h2>
          <div className="mt-3">
            <LegalText slug={slug} document={document} />
          </div>
        </section>

        <div className="mt-8">
          <ConsentForm slug={slug} documentId={document.id} />
        </div>

        <p className="mt-6 text-center">
          <Link href={`/c/${slug}/privacy`} className="text-[0.875rem] text-p-muted underline-offset-4 hover:underline">
            מדיניות הפרטיות של המרפאה
          </Link>
        </p>
      </main>
    </>
  );
}
