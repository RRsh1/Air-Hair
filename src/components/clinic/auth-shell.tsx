import type { ReactNode } from "react";
import { Wordmark } from "./wordmark";

/**
 * Frame for the staff sign-in screens: the form on the reading side, and a film strip whose
 * three frames are the three capture angles patients photograph on their schedule.
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

const frames = [
  { label: "קדימה", Head: FrontView },
  { label: "למעלה", Head: TopView },
  { label: "אחורה", Head: BackView },
];

function FilmStrip() {
  return (
    <aside
      aria-hidden="true"
      className="relative order-first flex h-28 items-center justify-center gap-3 bg-film px-10 md:order-none md:h-auto md:w-[22rem] md:flex-col md:gap-5 md:px-0 md:py-16"
    >
      <Sprockets className="inset-x-0 top-2.5 h-3 md:inset-y-0 md:end-auto md:start-3 md:top-0 md:h-auto md:w-3" />
      {frames.map(({ label, Head }) => (
        <figure
          key={label}
          className="relative aspect-[4/3] h-16 overflow-hidden rounded-[3px] bg-[#24363c] md:h-auto md:w-56 md:p-3"
        >
          <Head />
          <figcaption className="relative hidden text-[0.8125rem] font-medium text-[#9fb3b7] md:block">{label}</figcaption>
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

/* Outline drawings of the three angles. One stroke weight, no fill, quiet against the film. */

function HeadSvg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 90"
      className="absolute inset-0 h-full w-full"
      fill="none"
      stroke="#6f878c"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function FrontView() {
  return (
    <HeadSvg>
      <ellipse cx="60" cy="38" rx="17" ry="21" />
      <path d="M43 36c-3 0-4 6 0 7M77 36c3 0 4 6 0 7" />
      <path d="M45 30c4-9 26-9 30 0" />
      <path d="M53 59v5M67 59v5M26 90c3-16 16-24 34-24s31 8 34 24" />
    </HeadSvg>
  );
}

function TopView() {
  return (
    <HeadSvg>
      <ellipse cx="60" cy="47" rx="20" ry="25" />
      <path d="M56 22c2-4 6-4 8 0" />
      <path d="M40 46c-4 0-4 7 0 7M80 46c4 0 4 7 0 7" />
      <path d="M60 54a3 3 0 1 0 3-3a6 6 0 1 0 -9 5" />
    </HeadSvg>
  );
}

function BackView() {
  return (
    <HeadSvg>
      <ellipse cx="60" cy="38" rx="17" ry="21" />
      <path d="M43 36c-3 0-4 6 0 7M77 36c3 0 4 6 0 7" />
      <path d="M60 31a2.5 2.5 0 1 0 2.5-2.5a5 5 0 1 0 -7.5 4" />
      <path d="M53 59v5M67 59v5M26 90c3-16 16-24 34-24s31 8 34 24" />
    </HeadSvg>
  );
}
