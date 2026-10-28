import { connection } from "next/server";
import { Suspense } from "react";
import { getClinic } from "@/lib/patient-auth/server";
import { defaultPatientTheme, themeToCss } from "@/lib/theme/patient-theme";
import { getClinicBranding } from "@/lib/theme/server";

/**
 * Patient app shell. The default theme is part of the static shell; the clinic's published theme
 * streams in as a stylesheet that overrides it (same selector, later in the document).
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
  const clinic = await getClinic((await params).slug);
  if (!clinic) return null;
  const { theme } = await getClinicBranding(clinic.id);
  return <style>{themeToCss(theme)}</style>;
}
