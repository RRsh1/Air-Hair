import "@fontsource/ibm-plex-sans-hebrew/400.css";
import "@fontsource/ibm-plex-sans-hebrew/500.css";
import "@fontsource/ibm-plex-sans-hebrew/600.css";
import "@fontsource/ibm-plex-sans-hebrew/700.css";
import "@fontsource-variable/heebo";
import "@fontsource-variable/rubik";
import "@fontsource-variable/assistant";
import "@fontsource-variable/frank-ruhl-libre";
import "@fontsource-variable/noto-serif-hebrew";
import "@fontsource/secular-one";
import { connection } from "next/server";
import { Suspense } from "react";
import { selectedBranchId } from "@/lib/journal/patient-journal";
import { getClinic, getPatientContext } from "@/lib/patient-auth/server";
import { defaultPatientTheme, themeToCss } from "@/lib/theme/patient-theme";
import { getClinicBranding } from "@/lib/theme/server";

/**
 * Patient app shell. The default theme is part of the static shell; the clinic's published theme
 * streams in as a stylesheet that overrides it (same selector, later in the document).
 * Every curated face is declared here; browsers download only the ones the theme uses.
 */
export default function PatientLayout({ children, params }: LayoutProps<"/c/[slug]">) {
  return (
    <div className="p-root flex min-h-dvh flex-col text-p-ink">
      <style>{themeToCss(defaultPatientTheme)}</style>
      <Suspense fallback={null}>
        <ClinicTheme params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function ClinicTheme({ params }: Pick<LayoutProps<"/c/[slug]">, "params">) {
  await connection();
  const { slug } = await params;
  const clinic = await getClinic(slug);
  if (!clinic) return null;
  // Signed in: the branding of the branch the patient's treatment belongs to (if it has its own).
  const context = await getPatientContext(slug);
  const { theme } = await getClinicBranding(clinic.id, context ? selectedBranchId(context.journal) : null);
  return <style>{themeToCss(theme)}</style>;
}
