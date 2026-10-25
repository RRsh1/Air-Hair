import Link from "next/link";
import { signOutAction } from "@/app/c/[slug]/login/actions";

export function PatientHeader({ slug, clinicName, back }: { slug: string; clinicName: string; back?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-md items-center justify-between px-5 pb-2 pt-5">
      {back ? (
        <Link href={`/c/${slug}`} className="text-[0.9375rem] font-medium text-p-accent">
          חזרה לציר
        </Link>
      ) : (
        <p className="text-[0.9375rem] font-medium text-p-muted">{clinicName}</p>
      )}
      <form action={signOutAction.bind(null, slug)}>
        <button type="submit" className="text-[0.9375rem] text-p-muted underline-offset-4 hover:underline">
          יציאה
        </button>
      </form>
    </header>
  );
}
