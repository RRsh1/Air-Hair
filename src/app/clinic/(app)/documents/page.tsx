import { redirect } from "next/navigation";
import { Suspense } from "react";
import { formatLong } from "@/components/clinic/format";
import { getDb } from "@/db/client";
import { canStaff } from "@/lib/authz/policy";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { consentCoverage, listDocuments, MAX_TEXT_LENGTH, type LegalDocument, type LegalKind } from "@/lib/legal/documents";
import { localDate } from "@/lib/timeline/days";
import { PublishForm } from "./publish-form";

const kinds: { kind: LegalKind; title: string; about: string }[] = [
  {
    kind: "consent",
    title: "הסכמה לטיפול ולתיעוד",
    about: "המטופל חותם על המסמך הזה לפני הכניסה הראשונה לאפליקציה. גרסה חדשה מבקשת מכל המטופלים לחתום שוב.",
  },
  {
    kind: "privacy_policy",
    title: "מדיניות פרטיות",
    about: "מוצגת למטופלים בעמוד הכניסה ובתחתית האפליקציה. אין צורך לחתום עליה.",
  },
];

const errors: Record<string, string> = {
  empty: "המסמך ריק. הדביקו טקסט או בחרו קובץ.",
  too_long: `הטקסט ארוך מדי, עד ${MAX_TEXT_LENGTH.toLocaleString("he-IL")} תווים.`,
  not_pdf: "הקובץ אינו PDF תקין.",
  too_large: "הקובץ גדול מדי, עד 10MB.",
  forbidden: "אין לך הרשאה לפרסם מסמכים.",
  bad_request: "הבקשה לא הובנה. נסו שוב.",
};

export default function DocumentsPage({ searchParams }: PageProps<"/clinic/documents">) {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-16 pt-8 md:px-10 md:pt-10">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">מסמכים</h1>
      <p className="mt-2 max-w-[62ch] text-[1rem] text-slate">
        המסמכים המשפטיים של המרפאה. התוכן באחריות המרפאה. כל פרסום יוצר גרסה חדשה, והגרסאות הקודמות נשמרות יחד עם החתימות עליהן.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 rounded-lg bg-line/30" aria-hidden="true" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/clinic/documents">, "searchParams">) {
  const context = await getStaffContext();
  if (!canStaff(context.actor, "legal.manage", context.settings)) redirect("/clinic/patients");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const db = getDb();
  const [documents, coverage] = await Promise.all([listDocuments(db, context.actor.clinicId), consentCoverage(db, context.actor.clinicId)]);
  const timeZone = "Asia/Jerusalem";
  const published = one(params.published);
  const error = errors[one(params.error)];

  return (
    <div className="mt-8 space-y-10">
      {published && (
        <p role="status" className="rounded-md border border-petrol/25 bg-petrol/5 px-4 py-3 text-[0.9375rem] text-petrol-strong">
          גרסה {one(params.version)} של {published === "consent" ? "מסמך ההסכמה" : "מדיניות הפרטיות"} פורסמה.
        </p>
      )}
      {kinds.map(({ kind, title, about }) => {
        const versions = documents.filter((d) => d.kind === kind);
        const current = versions[0];
        return (
          <section key={kind} aria-labelledby={`${kind}-title`} className="rounded-lg border border-line bg-surface">
            <div className="border-b border-line px-5 py-5 md:px-7">
              <h2 id={`${kind}-title`} className="text-[1.375rem] font-semibold">
                {title}
              </h2>
              <p className="mt-1 max-w-[62ch] text-[0.9375rem] text-slate">{about}</p>
              <div className="mt-4 flex flex-wrap gap-x-10 gap-y-2 text-[0.9375rem]">
                {current ? (
                  <p>
                    <span className="text-slate">הגרסה הנוכחית </span>
                    <span className="font-semibold tabular-nums">{current.version}</span>
                    <span className="text-slate">, מ-{formatLong(localDate(current.publishedAt, timeZone))}</span>
                  </p>
                ) : (
                  <p className="font-medium text-signal">{kind === "consent" ? "עוד לא פורסם. המטופלים לא מתבקשים לחתום." : "עוד לא פורסמה."}</p>
                )}
                {kind === "consent" && coverage && (
                  <p>
                    <span className="font-semibold tabular-nums">{coverage.signed}</span>
                    <span className="text-slate"> מתוך </span>
                    <span className="font-semibold tabular-nums">{coverage.active}</span>
                    <span className="text-slate"> המטופלים בטיפול חתמו על הגרסה הנוכחית</span>
                  </p>
                )}
              </div>
            </div>
            <div className="px-5 py-5 md:px-7">
              <PublishForm kind={kind} hasCurrent={Boolean(current)} error={one(params.kind) === kind ? error : undefined} />
              {versions.length > 0 && <History versions={versions} timeZone={timeZone} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function History({ versions, timeZone }: { versions: LegalDocument[]; timeZone: string }) {
  return (
    <div className="mt-6">
      <h3 className="text-[1rem] font-semibold">גרסאות</h3>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {versions.map((doc, i) => (
          <li key={doc.id} className="py-3">
            {doc.format === "file" ? (
              <div className="flex items-center justify-between gap-4">
                <VersionLine doc={doc} current={i === 0} timeZone={timeZone} />
                <a href={`/clinic/documents/${doc.id}`} target="_blank" rel="noopener" className="text-[0.9375rem] font-medium text-petrol">
                  פתיחת ה-PDF
                </a>
              </div>
            ) : (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <VersionLine doc={doc} current={i === 0} timeZone={timeZone} />
                  <span className="text-[0.9375rem] font-medium text-petrol group-open:hidden">הצגת הטקסט</span>
                  <span className="hidden text-[0.9375rem] font-medium text-petrol group-open:inline">הסתרה</span>
                </summary>
                <div className="mt-3 max-h-80 overflow-auto whitespace-pre-line rounded-md bg-paper px-4 py-3 text-[0.9375rem] leading-relaxed">{doc.bodyText}</div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function VersionLine({ doc, current, timeZone }: { doc: LegalDocument; current: boolean; timeZone: string }) {
  return (
    <span>
      <span className="font-semibold tabular-nums">גרסה {doc.version}</span>
      {current && <span className="ms-2 rounded-full bg-petrol/10 px-2 py-0.5 text-[0.8125rem] font-medium text-petrol-strong">נוכחית</span>}
      <span className="ms-3 text-[0.875rem] text-slate">
        {formatLong(localDate(doc.publishedAt, timeZone))}, {doc.format === "file" ? "קובץ PDF" : "טקסט"}
      </span>
    </span>
  );
}
