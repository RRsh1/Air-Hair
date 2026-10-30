import type { ReactNode } from "react";
import type { ThemeBlocks } from "@/lib/theme/patient-theme";

const logoHeight = { s: "h-7", m: "h-9", l: "h-12" } as const;

/** Clinic mark and the sign-out (or back) control. Variants: inline, bar, centered. */
export function HeaderBlock({
  config,
  clinicName,
  logoSrc,
  start,
  end,
}: {
  config: ThemeBlocks["header"];
  clinicName: string;
  logoSrc: string | null;
  /** Replaces the clinic mark at the start edge (e.g. a back link). */
  start?: ReactNode;
  end: ReactNode;
}) {
  const mark = logoSrc ? (
    // eslint-disable-next-line @next/next/no-img-element -- clinic logo served by our route
    <img
      src={logoSrc}
      alt={clinicName}
      className={`${logoHeight[config.logoSize]} w-auto max-w-[62vw] object-contain ${config.variant === "centered" ? "" : "object-right"}`}
    />
  ) : (
    <span className="p-heading text-[1.0625rem] text-hd-ink">{clinicName}</span>
  );

  if (config.variant === "centered") {
    return (
      <header data-block="header" className="relative mx-auto w-full max-w-md px-5 pb-3 pt-6 text-hd-ink">
        <div className="flex min-h-9 justify-center">{start ?? mark}</div>
        <div className="absolute end-5 top-6 flex min-h-9 items-center">{end}</div>
      </header>
    );
  }

  return (
    <header data-block="header" className={config.variant === "bar" ? "bg-hd-bg text-hd-ink" : "text-hd-ink"}>
      <div className={`mx-auto flex w-full max-w-md items-center justify-between gap-4 px-5 ${config.variant === "bar" ? "py-3.5" : "pb-2 pt-5"}`}>
        <div className="flex min-h-9 items-center">{start ?? mark}</div>
        {end}
      </div>
    </header>
  );
}
