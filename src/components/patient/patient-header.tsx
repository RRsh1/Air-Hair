import Link from "next/link";
import { signOutAction } from "@/app/c/[slug]/login/actions";
import { getClinicBranding, logoUrl } from "@/lib/theme/server";

export async function PatientHeader({
  slug,
  clinic,
  back,
}: {
  slug: string;
  clinic: { id: string; name: string };
  back?: boolean;
}) {
  const { logoId } = await getClinicBranding(clinic.id);
  return (
    <header className="mx-auto flex w-full max-w-md items-center justify-between gap-4 px-5 pb-2 pt-5">
      {back ? (
        <Link href={`/c/${slug}`} className="text-[0.9375rem] font-medium text-p-accent">
          חזרה לציר
        </Link>
      ) : (
        <ClinicMark slug={slug} name={clinic.name} logoId={logoId} />
      )}
      <form action={signOutAction.bind(null, slug)}>
        <button type="submit" className="text-[0.9375rem] text-p-muted underline-offset-4 hover:underline">
          יציאה
        </button>
      </form>
    </header>
  );
}

/** The clinic's logo when it has one, otherwise its name. */
export function ClinicMark({ slug, name, logoId, large }: { slug: string; name: string; logoId: string | null; large?: boolean }) {
  if (!logoId) return <p className={`${large ? "text-[1rem]" : "text-[0.9375rem]"} font-medium text-p-muted`}>{name}</p>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- clinic logo served by our route
    <img src={logoUrl(slug, logoId)} alt={name} className={`${large ? "h-12" : "h-8"} w-auto max-w-[60%] object-contain object-right`} />
  );
}
