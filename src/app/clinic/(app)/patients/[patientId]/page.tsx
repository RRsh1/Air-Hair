import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatLong, formatMobile, formatShort } from "@/components/clinic/format";
import { procedureOptions } from "@/components/clinic/procedure-options";
import { getDb } from "@/db/client";
import { listBranches } from "@/lib/branches/branches";
import { listClinicProcedures, listLibrary } from "@/lib/catalog/procedures";
import { openPatient, staffMayAccess, type TreatmentDetail } from "@/lib/clinic-patients/patients";
import { getStaffContext, staffRequestIp } from "@/lib/clinic-patients/server";
import { maxScheduleDay } from "@/lib/timeline/capture-schedule";
import { localDate } from "@/lib/timeline/days";
import { AddTreatment } from "./add-treatment";
import { ContactSheet } from "./contact-sheet";
import { TreatmentActions } from "./treatment-actions";

const statusText = { scheduled: "מתוכנן", performed: "בהחלמה", completed: "הסתיים", cancelled: "בוטל" } as const;

export default function PatientPage({ params }: PageProps<"/clinic/patients/[patientId]">) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 md:px-10 md:pt-10">
      <Link href="/clinic/patients" className="text-[0.9375rem] font-medium text-petrol">
        כל המטופלים
      </Link>
      <Suspense fallback={<div className="mt-4 h-[28rem] rounded-lg bg-line/30" aria-hidden="true" />}>
        <Card params={params} />
      </Suspense>
    </div>
  );
}

async function Card({ params }: Pick<PageProps<"/clinic/patients/[patientId]">, "params">) {
  const { patientId } = await params;
  const context = await getStaffContext();
  const db = getDb();
  const result = await openPatient(db, context, { patientId, ip: await staffRequestIp() });
  if (result.status !== "ok") notFound();
  const { card } = result;

  const [branches, procedures, library, canEdit, canMark] = await Promise.all([
    listBranches(db, context.actor.clinicId),
    listClinicProcedures(db, context.actor.clinicId),
    listLibrary(db),
    staffMayAccess(db, context, card.id, "patient.edit"),
    staffMayAccess(db, context, card.id, "treatment.mark_performed"),
  ]);
  const totalDays = maxScheduleDay(context.settings.followUpMonths);
  const today = localDate(new Date(), card.timeZone);
  const active = card.treatments.filter((t) => t.status === "scheduled" || t.status === "performed");
  const archive = card.treatments.filter((t) => t.status === "completed" || t.status === "cancelled");

  return (
    <div className="mt-3 grid gap-10 lg:grid-cols-[1fr_17rem]">
      <div className="min-w-0">
        <header>
          <h1 className="text-[2.25rem] font-semibold leading-tight tracking-tight">{card.fullName}</h1>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[0.9375rem]">
            <div className="flex gap-2">
              <dt className="text-slate">נייד</dt>
              <dd>
                <a href={`tel:${card.phone}`} dir="ltr" className="tabular-nums text-ink underline-offset-4 hover:underline">
                  {formatMobile(card.phone)}
                </a>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate">תעודת זהות</dt>
              <dd className="tabular-nums">מסתיימת ב-{card.nationalIdTail}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate">כרטיס נפתח</dt>
              <dd className="tabular-nums">{formatShort(localDate(card.createdAt, card.timeZone))}</dd>
            </div>
          </dl>
        </header>

        <div className="mt-10 space-y-8">
          {active.map((treatment) => (
            <Treatment key={treatment.id} treatment={treatment} totalDays={totalDays} today={today} canEdit={canEdit} canMark={canMark} />
          ))}
          {active.length === 0 && (
            <p className="rounded-lg border border-dashed border-line px-5 py-6 text-[1rem] text-slate">אין למטופל טיפול פעיל. טיפול חדש נפתח באותו כרטיס.</p>
          )}
          {canEdit && <AddTreatment patientId={card.id} branches={branches} procedures={procedureOptions(procedures, library)} />}
        </div>

        {archive.length > 0 && (
          <section className="mt-12" aria-labelledby="archive-title">
            <h2 id="archive-title" className="text-[1.25rem] font-semibold">
              טיפולים קודמים
            </h2>
            <p className="mt-1 text-[0.9375rem] text-slate">נשמרים במלואם לצפייה. אי אפשר להוסיף להם תמונות או הערות.</p>
            <div className="mt-4 space-y-3">
              {archive.map((treatment) => (
                <details key={treatment.id} className="group rounded-lg border border-line bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                    <span>
                      <span className="block text-[1.0625rem] font-semibold">{treatment.name}</span>
                      <span className="block text-[0.875rem] text-slate">
                        {statusText[treatment.status]}, {treatment.branchName}
                        {treatment.actualSurgeryDate && <>, ניתוח ב-{formatShort(treatment.actualSurgeryDate)}</>}
                      </span>
                    </span>
                    <span className="text-[0.9375rem] text-petrol group-open:hidden">הצגה</span>
                    <span className="hidden text-[0.9375rem] text-petrol group-open:inline">הסתרה</span>
                  </summary>
                  <div className="border-t border-line px-5 pb-5 pt-4">
                    <TreatmentBody treatment={treatment} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="space-y-8 lg:pt-3">
        <section aria-labelledby="consents-title">
          <h2 id="consents-title" className="text-[1.0625rem] font-semibold">
            מסמכים חתומים
          </h2>
          {card.consents.length === 0 ? (
            <p className="mt-2 text-[0.9375rem] text-slate">המטופל עוד לא חתם על מסמכים.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {card.consents.map((c) => (
                <li key={c.documentId} className="py-3">
                  <p className="text-[0.9375rem] font-medium">{c.kind === "consent" ? "הסכמה לטיפול ולתיעוד" : "מדיניות פרטיות"}</p>
                  <p className="text-[0.875rem] text-slate">
                    גרסה {c.version}, נחתם ב-{formatLong(localDate(c.signedAt, card.timeZone))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Treatment({
  treatment,
  totalDays,
  today,
  canEdit,
  canMark,
}: {
  treatment: TreatmentDetail;
  totalDays: number;
  today: string;
  canEdit: boolean;
  canMark: boolean;
}) {
  const performed = treatment.status === "performed";
  return (
    <section aria-labelledby={`t-${treatment.id}`} className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-5 md:px-6">
        <div>
          <h2 id={`t-${treatment.id}`} className="text-[1.375rem] font-semibold leading-tight">
            {treatment.name}
          </h2>
          <p className="mt-1 text-[0.9375rem] text-slate">{treatment.branchName}</p>
        </div>
        <div className="text-end">
          {performed && treatment.day !== null ? (
            <p className="text-[1.75rem] font-semibold leading-none tabular-nums">
              יום {treatment.day}
              <span className="ms-1.5 text-[0.9375rem] font-normal text-slate">מתוך {totalDays}</span>
            </p>
          ) : (
            <p className="text-[1rem] font-semibold">{statusText[treatment.status]}</p>
          )}
          <p className="mt-1.5 text-[0.9375rem] text-slate">
            {performed && treatment.actualSurgeryDate
              ? `ניתוח ב-${formatLong(treatment.actualSurgeryDate)}`
              : `ניתוח מתוכנן ל-${formatLong(treatment.plannedSurgeryDate)}`}
          </p>
        </div>
      </div>
      <div className="px-5 py-5 md:px-6">
        <TreatmentBody treatment={treatment} />
      </div>
      {(canEdit || canMark) && (
        <div className="border-t border-line px-5 py-4 md:px-6">
          <TreatmentActions
            treatmentId={treatment.id}
            status={treatment.status}
            today={today}
            plannedDate={treatment.plannedSurgeryDate}
            actualDate={treatment.actualSurgeryDate}
            canEdit={canEdit}
            canMark={canMark}
          />
        </div>
      )}
    </section>
  );
}

function TreatmentBody({ treatment }: { treatment: TreatmentDetail }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[1rem] font-semibold">
          תיעוד
          <span className="ms-2 font-normal text-slate">{treatment.days.length === 0 ? "עוד אין תמונות" : `${treatment.days.length} ימים מצולמים`}</span>
        </h3>
        {treatment.days.length > 0 && <ContactSheet days={treatment.days} />}
      </div>
      {treatment.notes.length > 0 && (
        <div>
          <h3 className="text-[1rem] font-semibold">הערות המטופל</h3>
          <ul className="mt-2 space-y-3">
            {treatment.notes.map((note) => (
              <li key={note.date} className="border-s-2 border-line ps-3">
                <p className="text-[0.875rem] tabular-nums text-slate">{formatLong(note.date)}</p>
                <p className="mt-0.5 whitespace-pre-line text-[1rem] leading-relaxed">{note.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
