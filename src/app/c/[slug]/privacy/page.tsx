import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatDayMonth } from "@/components/patient/format";
import { LegalText } from "@/components/patient/legal-text";
import { getDb } from "@/db/client";
import { currentDocument } from "@/lib/legal/documents";
import { getClinic } from "@/lib/patient-auth/server";
import { localDate } from "@/lib/timeline/days";

/** The clinic's privacy policy. Public: patients can read it before signing in. */
export default function PrivacyPage({ params }: PageProps<"/c/[slug]/privacy">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 pb-12 pt-5">
      <Suspense fallback={<div className="h-40" aria-hidden="true" />}>
        <PrivacyBody params={params} />
      </Suspense>
    </main>
  );
}

async function PrivacyBody({ params }: Pick<PageProps<"/c/[slug]/privacy">, "params">) {
  await connection();
  const { slug } = await params;
  const clinic = await getClinic(slug);
  if (!clinic) notFound();
  const document = await currentDocument(getDb(), clinic.id, "privacy_policy");

  return (
    <>
      <Link href={`/c/${slug}`} className="text-[0.9375rem] font-medium text-p-accent">
        חזרה
      </Link>
      <p className="mt-6 text-[1rem] font-medium text-p-muted">{clinic.name}</p>
      <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-tight">מדיניות פרטיות</h1>
      {document ? (
        <>
          <p className="mt-2 text-[0.9375rem] text-p-muted">
            עודכנה ב-{formatDayMonth(localDate(document.publishedAt, clinic.timeZone))}
          </p>
          <div className="mt-7">
            <LegalText slug={slug} document={document} />
          </div>
        </>
      ) : (
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-p-muted">
          המרפאה עדיין לא פרסמה כאן מדיניות פרטיות. לשאלות על השימוש במידע ובתמונות שלכם אפשר לפנות ישירות למרפאה.
        </p>
      )}
    </>
  );
}
