import type { PatientTheme } from "@/lib/theme/patient-theme";

export type PhotoLogoConfig = { src: string; position: PatientTheme["logoPosition"] } | null;

const corner: Record<PatientTheme["logoPosition"], string> = {
  "bottom-end": "bottom-3 end-3",
  "bottom-start": "bottom-3 start-3",
  "top-end": "top-3 end-3",
  "top-start": "top-3 start-3",
};

/** The clinic logo laid over a photo while it is shown (the stored photo stays clean). */
export function PhotoLogo({ logo }: { logo: PhotoLogoConfig }) {
  if (!logo) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small clinic logo, served by our route
    <img
      src={logo.src}
      alt=""
      aria-hidden="true"
      className={`p-logo-overlay pointer-events-none absolute ${corner[logo.position]} max-h-[11%] max-w-[34%] object-contain drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]`}
    />
  );
}
