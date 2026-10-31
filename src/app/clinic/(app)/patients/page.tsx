import Link from "next/link";
import { Suspense } from "react";
import { formatAgo } from "@/components/clinic/format";
import { RecoveryRuler } from "@/components/clinic/recovery-ruler";
import { getDb } from "@/db/client";
import { canStaff } from "@/lib/authz/policy";
import { listBranches } from "@/lib/branches/branches";
import { listPatients, type PatientRow } from "@/lib/clinic-patients/patients";
import { getStaffContext } from "@/lib/clinic-patients/server";
import { maxScheduleDay } from "@/lib/timeline/capture-schedule";

type Status = "active" | "archive" | "all";
const statusTabs: { value: Status; label: string }[] = [
  { value: "active", label: "בטיפול" },
  { value: "archive", label: "ארכיון" },
  { value: "all", label: "כולם" },
];

export default function PatientsPage({ searchParams }: PageProps<"/clinic/patients">) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 md:px-10 md:pt-10">
      <Suspense fallback={<RegisterSkeleton />}>
        <Register searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Register({ searchParams }: Pick<PageProps<"/clinic/patients">, "searchParams">) {
  const context = await getStaffContext();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status: Status = (["active", "archive", "all"] as const).find((s) => s === one(params.status)) ?? "active";
  const query = one(params.q).slice(0, 80);
  const db = getDb();
  const branches = await listBranches(db, context.actor.clinicId);
  const branchId = branches.find((b) => b.id === one(params.branch))?.id;
  const rows = await listPatients(db, context, { status, branchId, query });
  const totalDays = maxScheduleDay(context.settings.followUpMonths);
  const canCreate = canStaff(context.actor, "patient.create", context.settings);
  const now = new Date();

  const href = (next: Partial<{ status: Status; branch: string; q: string }>) => {
    const merged = { status, branch: branchId ?? "", q: query, ...next };
    const search = new URLSearchParams(Object.entries(merged).filter(([k, v]) => v && !(k === "status" && v === "active")));
    const s = search.toString();
    return s ? `/clinic/patients?${s}` : "/clinic/patients";
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">מטופלים</h1>
          <p className="mt-1 text-[1rem] text-slate">
            {rows.length === 0 ? "אין מטופלים להצגה" : rows.length === 1 ? "מטופל אחד" : `${rows.length} מטופלים`}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/clinic/patients/new"
            className="flex h-11 items-center rounded-md bg-petrol px-5 text-[1rem] font-semibold text-white hover:bg-petrol-strong"
          >
            מטופל חדש
          </Link>
        )}
      </div>

      <div className="mt-7 flex flex-col gap-3 md:flex-row md:items-center">
        <form action="/clinic/patients" role="search" className="md:w-80">
          {status !== "active" && <input type="hidden" name="status" value={status} />}
          {branchId && <input type="hidden" name="branch" value={branchId} />}
          <label htmlFor="q" className="sr-only">
            חיפוש מטופל
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="שם, תעודת זהות או נייד"
            className="block h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[1rem] placeholder:text-slate/70 focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
          />
        </form>
        <nav aria-label="סינון לפי מצב" className="flex rounded-md border border-line bg-surface p-1">
          {statusTabs.map((tab) => (
            <Link
              key={tab.value}
              href={href({ status: tab.value })}
              aria-current={tab.value === status ? "true" : undefined}
              className={`flex h-9 flex-1 items-center justify-center rounded-[5px] px-4 text-[0.9375rem] md:flex-none ${
                tab.value === status ? "bg-ink font-semibold text-white" : "text-ink hover:bg-paper"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {branches.length > 1 && (
          <nav aria-label="סינון לפי סניף" className="flex flex-wrap gap-1.5">
            {[{ id: "", name: "כל הסניפים" }, ...branches].map((branch) => (
              <Link
                key={branch.id || "all"}
                href={href({ branch: branch.id })}
                aria-current={(branchId ?? "") === branch.id ? "true" : undefined}
                className={`flex h-9 items-center rounded-full border px-3.5 text-[0.9375rem] ${
                  (branchId ?? "") === branch.id ? "border-ink text-ink" : "border-line text-slate hover:text-ink"
                }`}
              >
                {branch.name}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState searching={Boolean(query) || status !== "active" || Boolean(branchId)} canCreate={canCreate} />
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
          <div className="hidden grid-cols-[minmax(11rem,1.2fr)_minmax(10rem,1fr)_minmax(13rem,1.2fr)_7.5rem_6.5rem] gap-6 border-b border-line px-6 py-3 text-[0.875rem] text-slate md:grid">
            <span>מטופל</span>
            <span>טיפול</span>
            <span>שלב בהחלמה</span>
            <span>צילום אחרון</span>
            <span>הסכמה</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <PatientLine key={row.id} row={row} totalDays={totalDays} now={now} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function PatientLine({ row, totalDays, now }: { row: PatientRow; totalDays: number; now: Date }) {
  const [main, ...others] = row.treatments;
  return (
    <li>
      <Link
        href={`/clinic/patients/${row.id}`}
        className="grid grid-cols-1 gap-2 px-5 py-4 hover:bg-paper/70 focus-visible:bg-paper md:grid-cols-[minmax(11rem,1.2fr)_minmax(10rem,1fr)_minmax(13rem,1.2fr)_7.5rem_6.5rem] md:items-center md:gap-6 md:px-6"
      >
        <span>
          <span className="block text-[1.0625rem] font-semibold leading-snug">{row.fullName}</span>
          <span className="mt-0.5 block text-[0.875rem] tabular-nums text-slate">נייד שמסתיים ב-{row.phoneTail}</span>
        </span>
        <span>
          {main ? (
            <>
              <span className="block text-[1rem] leading-snug">{main.name}</span>
              <span className="mt-0.5 block text-[0.875rem] text-slate">
                {main.branchName}
                {others.length > 0 && <>, ועוד {others.length === 1 ? "טיפול אחד" : `${others.length} טיפולים`}</>}
              </span>
            </>
          ) : (
            <span className="text-slate">אין טיפול</span>
          )}
        </span>
        <span>{main && <RecoveryRuler treatment={main} totalDays={totalDays} />}</span>
        <span className="text-[0.9375rem] text-slate">
          <span className="md:hidden">צילום אחרון: </span>
          {row.lastCaptureAt ? formatAgo(row.lastCaptureAt, now) : "עוד לא צילם"}
        </span>
        <span className="text-[0.9375rem]">
          {row.consentSigned === null ? (
            <span className="text-slate">אין מסמך</span>
          ) : row.consentSigned ? (
            <span className="text-petrol-strong">נחתם</span>
          ) : (
            <span className="font-medium text-signal">לא נחתם</span>
          )}
        </span>
      </Link>
    </li>
  );
}

function EmptyState({ searching, canCreate }: { searching: boolean; canCreate: boolean }) {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-14 text-center">
      {searching ? (
        <p className="text-[1.0625rem] text-slate">לא נמצא מטופל שמתאים לחיפוש או לסינון.</p>
      ) : (
        <>
          <p className="text-[1.125rem] font-semibold">עדיין אין מטופלים</p>
          <p className="mx-auto mt-2 max-w-[44ch] text-[1rem] text-slate">
            כרטיס מטופל נפתח עם תאריך הניתוח המתוכנן. מרגע זה המטופל יכול להיכנס ולצלם את התיעוד שלפני הניתוח.
          </p>
          {canCreate && (
            <Link href="/clinic/patients/new" className="mt-5 inline-flex h-11 items-center rounded-md bg-petrol px-5 font-semibold text-white">
              מטופל חדש
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function RegisterSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="h-9 w-40 rounded bg-line/60" />
      <div className="mt-8 h-11 w-full max-w-xl rounded bg-line/40" />
      <div className="mt-6 h-72 rounded-lg bg-line/30" />
    </div>
  );
}
