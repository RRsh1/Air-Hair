"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { TextField } from "@/components/clinic/fields";
import type { Branch } from "@/lib/branches/branches";
import type { StaffMember } from "@/lib/staff/manage";
import { inviteStaffAction, resendInviteAction, setActiveAction, updateStaffAction, type StaffFormState } from "./actions";

const idle: StaffFormState = { status: "idle" };

export function StaffList({ staff, branches, selfId }: { staff: StaffMember[]; branches: Branch[]; selfId: string }) {
  const active = staff.filter((s) => !s.disabled);
  const disabled = staff.filter((s) => s.disabled);
  return (
    <div className="mt-8 space-y-8">
      <Invite branches={branches} />
      <section aria-labelledby="active-title">
        <h2 id="active-title" className="text-[1.125rem] font-semibold">
          פעילים <span className="font-normal text-slate">{active.length}</span>
        </h2>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {active.map((member) => (
            <MemberRow key={member.id} member={member} branches={branches} isSelf={member.id === selfId} />
          ))}
        </ul>
      </section>
      {disabled.length > 0 && (
        <section aria-labelledby="disabled-title">
          <h2 id="disabled-title" className="text-[1.125rem] font-semibold">
            מושבתים <span className="font-normal text-slate">{disabled.length}</span>
          </h2>
          <p className="mt-1 text-[0.9375rem] text-slate">אין להם גישה ללוח. הפעולות שעשו נשמרות ביומן.</p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {disabled.map((member) => (
              <MemberRow key={member.id} member={member} branches={branches} isSelf={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function branchText(member: StaffMember, branches: Branch[]): string {
  if (member.allBranches) return "כל הסניפים";
  const names = member.branchIds.map((id) => branches.find((b) => b.id === id)?.name).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "אין סניפים";
}

function MemberRow({ member, branches, isSelf }: { member: StaffMember; branches: Branch[]; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<StaffFormState>(idle);
  const [pending, start] = useTransition();
  const run = (task: () => Promise<StaffFormState>) => start(async () => setMessage(await task()));

  return (
    <li className="px-5 py-4 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[1.0625rem] font-semibold">
            {member.fullName}
            {isSelf && <span className="text-[0.875rem] font-normal text-slate">(את/ה)</span>}
            {member.role === "admin" && <span className="rounded-full bg-petrol/10 px-2 py-0.5 text-[0.8125rem] font-medium text-petrol-strong">מנהל</span>}
            {!member.activated && !member.disabled && (
              <span className="rounded-full bg-[#f3e6c8] px-2 py-0.5 text-[0.8125rem] font-medium text-[#6b4e12]">ממתין להפעלה</span>
            )}
          </p>
          <p className="text-[0.875rem] text-slate">
            <span dir="ltr">{member.email}</span>
            <span className="mx-2 text-line">|</span>
            {branchText(member, branches)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {!member.disabled && (
            <button type="button" onClick={() => setEditing((e) => !e)} aria-expanded={editing} className="h-9 rounded-md border border-line px-3 text-[0.9375rem] hover:border-petrol hover:text-petrol">
              עריכה
            </button>
          )}
          {!member.activated && !member.disabled && (
            <button type="button" disabled={pending} onClick={() => run(() => resendInviteAction(member.id))} className="h-9 rounded-md px-3 text-[0.9375rem] text-petrol hover:underline disabled:opacity-60">
              שליחת הקישור שוב
            </button>
          )}
          {!isSelf &&
            (member.disabled ? (
              <button type="button" disabled={pending} onClick={() => run(() => setActiveAction(member.id, true))} className="h-9 rounded-md px-3 text-[0.9375rem] text-petrol hover:underline disabled:opacity-60">
                הפעלה מחדש
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={() => run(() => setActiveAction(member.id, false))} className="h-9 rounded-md px-3 text-[0.9375rem] text-slate hover:text-signal disabled:opacity-60">
                השבתה
              </button>
            ))}
        </div>
      </div>
      {message.status !== "idle" && message.message && (
        <p role={message.status === "error" ? "alert" : "status"} className={`mt-2 text-[0.875rem] ${message.status === "error" ? "text-signal" : "text-petrol-strong"}`}>
          {message.message}
        </p>
      )}
      {editing && <EditForm member={member} branches={branches} onDone={() => setEditing(false)} />}
    </li>
  );
}

function EditForm({ member, branches, onDone }: { member: StaffMember; branches: Branch[]; onDone: () => void }) {
  const [state, submit, pending] = useActionState<StaffFormState, FormData>(async (prev, form) => {
    const next = await updateStaffAction(member.id, prev, form);
    if (next.status === "done") onDone();
    return next;
  }, idle);
  return (
    <form action={submit} className="mt-4 space-y-4 rounded-lg bg-paper px-4 py-4" noValidate>
      <StaffFields branches={branches} state={state} defaults={{ fullName: member.fullName, manager: member.role === "admin", allBranches: member.allBranches, branchIds: member.branchIds }} />
      {state.status === "error" && !state.field && (
        <p role="alert" className="text-[0.9375rem] text-signal">
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="h-10 rounded-md bg-petrol px-5 font-semibold text-white hover:bg-petrol-strong disabled:opacity-60">
          {pending ? "שומר…" : "שמירה"}
        </button>
        <button type="button" onClick={onDone} className="h-10 px-2 text-slate hover:text-ink">
          ביטול
        </button>
      </div>
    </form>
  );
}

function Invite({ branches }: { branches: Branch[] }) {
  const details = useRef<HTMLDetailsElement>(null);
  // A sent invitation remounts the fields (fresh defaults) instead of resetting controlled inputs.
  const [round, setRound] = useState(0);
  const [state, submit, pending] = useActionState<StaffFormState, FormData>(async (prev, form) => {
    const next = await inviteStaffAction(prev, form);
    if (next.status === "done") setRound((r) => r + 1);
    return next;
  }, idle);
  return (
    <details ref={details} className="group rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 md:px-6">
        <span>
          <span className="block text-[1.0625rem] font-semibold">הזמנת איש צוות</span>
          <span className="block text-[0.875rem] text-slate">נשלח אליו קישור להגדרת סיסמה, ובכניסה הראשונה הוא מגדיר אימות דו-שלבי</span>
        </span>
        <span className="text-[0.9375rem] font-medium text-petrol group-open:hidden">פתיחה</span>
      </summary>
      <form key={round} action={submit} className="space-y-4 border-t border-line px-5 pb-5 pt-4 md:px-6" noValidate>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="אימייל" id="invite-email" name="email" type="email" dir="ltr" autoComplete="off" error={state.field === "email" ? state.message : undefined} />
        </div>
        <StaffFields branches={branches} state={state} defaults={{ fullName: "", manager: false, allBranches: true, branchIds: [] }} idPrefix="invite" />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="h-10 rounded-md bg-petrol px-5 font-semibold text-white hover:bg-petrol-strong disabled:opacity-60">
            {pending ? "שולח…" : "שליחת הזמנה"}
          </button>
          {state.status === "done" && (
            <p role="status" className="text-[0.9375rem] text-petrol-strong">
              {state.message}
            </p>
          )}
          {state.status === "error" && !state.field && (
            <p role="alert" className="text-[0.9375rem] text-signal">
              {state.message}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}

function StaffFields({
  branches,
  state,
  defaults,
  idPrefix = "edit",
}: {
  branches: Branch[];
  state: StaffFormState;
  defaults: { fullName: string; manager: boolean; allBranches: boolean; branchIds: string[] };
  idPrefix?: string;
}) {
  const [manager, setManager] = useState(defaults.manager);
  const [scope, setScope] = useState<"all" | "some">(defaults.allBranches ? "all" : "some");
  const id = (name: string) => `${idPrefix}-${name}-${defaults.fullName || "new"}`;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="שם מלא" id={id("name")} name="fullName" defaultValue={defaults.fullName} error={state.field === "fullName" ? state.message : undefined} />
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="manager" checked={manager} onChange={(e) => setManager(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--petrol)]" />
        <span>
          <span className="block text-[1rem] font-medium">מנהל</span>
          <span className="block text-[0.875rem] text-slate">מנהל גם את הצוות, ההגדרות, המיתוג והמסמכים, ועובד בכל הסניפים</span>
        </span>
      </label>
      {!manager && branches.length > 1 && (
        <fieldset>
          <legend className="text-[0.9375rem] font-medium">סניפים</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {(["all", "some"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="scope" value={value} checked={scope === value} onChange={() => setScope(value)} className="h-4 w-4 accent-[var(--petrol)]" />
                {value === "all" ? "כל הסניפים" : "סניפים מסוימים"}
              </label>
            ))}
          </div>
          {scope === "some" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {branches.map((b) => (
                <label key={b.id} className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 text-[0.9375rem] has-[:checked]:border-ink has-[:checked]:font-medium">
                  <input type="checkbox" name="branchIds" value={b.id} defaultChecked={defaults.branchIds.includes(b.id)} className="h-4 w-4 accent-[var(--petrol)]" />
                  {b.name}
                </label>
              ))}
            </div>
          )}
          {state.field === "branches" && (
            <p role="alert" className="mt-1.5 text-[0.875rem] text-signal">
              {state.message}
            </p>
          )}
        </fieldset>
      )}
    </>
  );
}
