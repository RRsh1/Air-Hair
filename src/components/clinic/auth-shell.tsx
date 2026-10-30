import type { ReactNode } from "react";
import { Wordmark } from "./wordmark";

/**
 * Frame for the staff sign-in screens: the form on the reading side, and a film strip whose
 * three frames stand for the three capture angles patients photograph on their schedule.
 */
export function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <main className="flex flex-1 items-start justify-center px-5 pb-12 pt-10 md:items-center md:px-12 md:py-12">
        <div className="w-full max-w-sm">
          <Wordmark className="mb-10 md:mb-12" />
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{title}</h1>
          {description && <p className="mt-3 text-[1.0625rem] leading-relaxed text-slate">{description}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <FilmStrip />
    </div>
  );
}

const frames = ["קדימה", "למעלה", "אחורה"];

function FilmStrip() {
  return (
    <aside
      aria-hidden="true"
      className="relative order-first flex h-28 items-center justify-center gap-3 bg-film px-10 md:order-none md:h-auto md:w-[22rem] md:flex-col md:gap-5 md:px-0 md:py-16"
    >
      <Sprockets className="inset-x-0 top-2.5 h-3 md:inset-y-0 md:end-auto md:start-3 md:top-0 md:h-auto md:w-3" />
      {frames.map((label, i) => (
        <figure
          key={label}
          className="relative flex aspect-[4/3] h-16 items-end justify-between overflow-hidden rounded-[3px] bg-[#24363c] p-2 md:h-auto md:w-56 md:p-3"
        >
          <figcaption className="hidden text-[0.8125rem] font-medium text-[#9fb3b7] md:block">{label}</figcaption>
          <span className="hidden text-[0.75rem] tabular-nums text-[#6f878c] md:block">{String(i + 1).padStart(2, "0")}</span>
        </figure>
      ))}
      <Sprockets className="inset-x-0 bottom-2.5 h-3 md:inset-y-0 md:start-auto md:end-3 md:bottom-0 md:h-auto md:w-3" />
    </aside>
  );
}

function Sprockets({ className }: { className: string }) {
  return (
    <span
      className={`absolute block ${className}`}
      style={{
        backgroundImage: "radial-gradient(circle, var(--paper) 0 3.5px, transparent 4px)",
        backgroundSize: "18px 18px",
        backgroundPosition: "center",
        opacity: 0.85,
      }}
    />
  );
}
