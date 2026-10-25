import { Suspense } from "react";
import { Wordmark } from "@/components/clinic/wordmark";
import { requireStaff } from "@/lib/auth/server";
import { SignOutButton } from "./sign-out-button";

const roleLabel = { admin: "אדמין", doctor: "צוות" } as const;

export default function ClinicHome() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-4">
            <Wordmark />
            <Suspense fallback={null}>
              <ClinicName />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <StaffMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12">
        <Suspense fallback={<div className="h-9 w-64 animate-pulse rounded-md bg-line/60" aria-hidden="true" />}>
          <Welcome />
        </Suspense>
      </main>
    </div>
  );
}

async function ClinicName() {
  const { staff } = await requireStaff();
  return (
    <>
      <span className="h-5 w-px bg-line" aria-hidden="true" />
      <span className="text-[1rem] font-medium">{staff.clinicName}</span>
    </>
  );
}

async function StaffMenu() {
  const { staff } = await requireStaff();
  return (
    <div className="flex items-center gap-4 text-[0.9375rem]">
      <span className="text-slate">
        {staff.fullName}, {roleLabel[staff.role]}
      </span>
      <SignOutButton />
    </div>
  );
}

async function Welcome() {
  const { staff } = await requireStaff();
  return (
    <>
      <h1 className="text-[2rem] font-semibold tracking-tight">שלום, {staff.fullName}</h1>
      <p className="mt-3 max-w-prose text-[1.0625rem] leading-relaxed text-slate">
        עדיין אין מטופלים. רשימת המטופלים, עורך ציר הזמן וההגדרות יופיעו כאן בשלבים הבאים.
      </p>
    </>
  );
}
