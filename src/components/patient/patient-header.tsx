import Link from "next/link";
import { signOutAction } from "@/app/c/[slug]/login/actions";
import { HeaderBlock } from "@/components/patient/blocks/header";
import { getClinicBranding, logoUrl } from "@/lib/theme/server";

/** The header on signed-in pages: clinic mark (or a back link) and sign-out. */
export async function PatientHeader({ slug, clinic, back }: { slug: string; clinic: { id: string; name: string }; back?: boolean }) {
  const { theme, logoId } = await getClinicBranding(clinic.id);
  return (
    <HeaderBlock
      config={theme.blocks.header}
      clinicName={clinic.name}
      logoSrc={logoId ? logoUrl(slug, logoId) : null}
      start={
        back ? (
          <Link href={`/c/${slug}`} className="text-[0.9375rem] font-medium text-p-accent">
            חזרה לציר
          </Link>
        ) : undefined
      }
      end={
        <form action={signOutAction.bind(null, slug)}>
          <button type="submit" className="text-[0.9375rem] underline-offset-4 hover:underline">
            יציאה
          </button>
        </form>
      }
    />
  );
}

/** The clinic's logo when it has one, otherwise its name (login and privacy pages). */
export function ClinicMark({ slug, name, logoId, large }: { slug: string; name: string; logoId: string | null; large?: boolean }) {
  if (!logoId) return <p className={`p-heading ${large ? "text-[1.0625rem]" : "text-[0.9375rem]"} text-p-muted`}>{name}</p>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- clinic logo served by our route
    <img src={logoUrl(slug, logoId)} alt={name} className={`${large ? "h-12" : "h-9"} w-auto max-w-[60%] object-contain object-right`} />
  );
}
