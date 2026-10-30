import type { ReactNode } from "react";
import type { PatientTheme } from "@/lib/theme/patient-theme";

export type PhotoLogo = {
  src: string;
  position: PatientTheme["logo"]["position"];
  size: PatientTheme["logo"]["size"];
  backing: PatientTheme["logo"]["backing"];
} | null;

/** The overlay config for a clinic, or null when it has no logo or turned the overlay off. */
export function photoLogo(theme: PatientTheme, logoSrc: string | null): PhotoLogo {
  if (!logoSrc || !theme.logo.overlay) return null;
  return { src: logoSrc, position: theme.logo.position, size: theme.logo.size, backing: theme.logo.backing };
}

const corner: Record<NonNullable<PhotoLogo>["position"], string> = {
  "bottom-end": "bottom-[5%] end-[5%]",
  "bottom-start": "bottom-[5%] start-[5%]",
  "top-end": "top-[5%] end-[5%]",
  "top-start": "top-[5%] start-[5%]",
};

/**
 * A patient photo with the clinic logo laid over it. The stored file stays clean; the logo is
 * drawn at display time and burned in only when the patient downloads (see downloadWithLogo).
 */
export function Photo({
  src,
  alt,
  logo,
  className = "",
  children,
}: {
  src: string;
  alt: string;
  logo: PhotoLogo;
  className?: string;
  children?: ReactNode;
}) {
  return (
    // Positioned by the caller when it passes "absolute"; otherwise a positioning context of its own.
    <div className={`p-photo overflow-hidden ${className.includes("absolute") ? "" : "relative"} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private photo served by an authenticated route */}
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
      {children}
      {logo && (
        <span
          aria-hidden="true"
          data-size={logo.size}
          className={`p-photo-logo pointer-events-none absolute ${corner[logo.position]} ${
            logo.backing === "plate" ? "rounded-[3px] bg-white/85 px-[4%] py-[3%]" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- clinic logo served by our route */}
          <img
            src={logo.src}
            alt=""
            className={`block max-h-[4.5rem] w-full object-contain ${logo.backing === "plate" ? "" : "drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.45)]"}`}
          />
        </span>
      )}
    </div>
  );
}
