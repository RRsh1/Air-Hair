import { Suspense } from "react";
import { Wordmark } from "@/components/clinic/wordmark";
import { requireStaff } from "@/lib/auth/server";
import { CurrentNavLinks, NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

/** The signed-in dashboard: a rail with the clinic and its sections, and the page. */
export default function DashboardLayout({ children }: LayoutProps<"/clinic">) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper md:flex-row">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-b-0 md:border-e">
        <div className="flex items-center justify-between gap-4 px-5 py-3 md:block md:px-6 md:pb-6 md:pt-7">
          <div>
            <Wordmark className="text-[1.25rem]" />
            <Suspense fallback={<span className="mt-1 block h-4" />}>
              <ClinicName />
            </Suspense>
          </div>
          <div className="md:hidden">
            <SignOutButton />
          </div>
        </div>
        <Suspense fallback={<NavLinks current={null} />}>
          <CurrentNavLinks />
        </Suspense>
        <div className="mt-auto hidden border-t border-line px-6 py-5 md:block">
          <Suspense fallback={null}>
            <StaffName />
          </Suspense>
          <div className="mt-3">
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

async function ClinicName() {
  const { staff } = await requireStaff();
  return <p className="mt-1 text-[0.9375rem] text-slate">{staff.clinicName}</p>;
}

async function StaffName() {
  const { staff } = await requireStaff();
  return <p className="text-[0.9375rem] font-medium">{staff.fullName}</p>;
}
