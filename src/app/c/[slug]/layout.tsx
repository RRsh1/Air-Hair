import type { CSSProperties } from "react";
import { defaultPatientTheme, themeToCssVars } from "@/lib/theme/patient-theme";

/**
 * Patient app shell. Theme tokens are CSS variables; per-clinic themes will replace the defaults
 * here once the branding editor exists.
 */
export default function PatientLayout({ children }: LayoutProps<"/c/[slug]">) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-p-bg text-p-ink"
      style={themeToCssVars(defaultPatientTheme) as CSSProperties}
    >
      {children}
    </div>
  );
}
