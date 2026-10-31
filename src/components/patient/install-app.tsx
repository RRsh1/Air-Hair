"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "ha_install_dismissed";
const subscribe = () => () => {};

/** What this device can do: already installed, Android-style prompt, iOS share sheet, or a browser menu. */
function useEnvironment() {
  return useSyncExternalStore(
    subscribe,
    () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(DISMISS_KEY) === "1";
      } catch {}
      return `${standalone ? 1 : 0}${ios ? 1 : 0}${dismissed ? 1 : 0}`;
    },
    () => "100",
  );
}

/**
 * "Add to home screen": the clinic's app opens like any other app, with its icon. Registers the
 * service worker (which makes the app installable), uses the browser's install prompt where there
 * is one (Android), and shows the two Share-sheet steps on iPhone.
 */
export function InstallApp({ slug, clinicName }: { slug: string; clinicName: string }) {
  const env = useEnvironment();
  const [standalone, ios, dismissedStored] = [env[0] === "1", env[1] === "1", env[2] === "1"];
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`/c/${slug}/sw.js`, { scope: `/c/${slug}/` }).catch(() => {});
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [slug]);

  if (standalone || installed || dismissed || dismissedStored) return null;
  if (!prompt && !ios) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPrompt(null);
    } else setShowSteps((s) => !s);
  };

  return (
    <section aria-labelledby="install-title" className="mx-auto w-full max-w-md px-5 pt-10">
      <div className="rounded-p border border-p-line bg-p-surface px-5 py-4">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- the clinic's generated app icon */}
          <img src={`/c/${slug}/icon/180`} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-[11px] border border-p-line" />
          <div className="min-w-0 flex-1">
            <h2 id="install-title" className="p-heading text-[1.0625rem] text-p-ink">
              {clinicName} במסך הבית
            </h2>
            <p className="mt-0.5 text-[0.9375rem] leading-snug text-p-muted">פותחים את התיעוד בלחיצה אחת, כמו כל אפליקציה.</p>
          </div>
        </div>
        {showSteps && (
          <ol className="mt-4 space-y-2 border-t border-p-line pt-3 text-[0.9375rem] text-p-ink">
            <li className="flex gap-2">
              <span className="p-numeral text-p-accent">1</span>
              <span>
                לוחצים על כפתור השיתוף
                <ShareIcon />
                בתחתית המסך
              </span>
            </li>
            <li className="flex gap-2">
              <span className="p-numeral text-p-accent">2</span>
              <span>בוחרים &quot;הוספה למסך הבית&quot; ומאשרים</span>
            </li>
          </ol>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={install} className="p-btn flex h-11 flex-1 items-center justify-center text-[1rem] font-semibold">
            {prompt ? "הוספה למסך הבית" : showSteps ? "הסתרת ההסבר" : "איך מוסיפים"}
          </button>
          <button type="button" onClick={dismiss} className="h-11 px-2 text-[0.9375rem] text-p-muted">
            לא עכשיו
          </button>
        </div>
      </div>
    </section>
  );
}

function ShareIcon() {
  return (
    <svg aria-label="שיתוף" viewBox="0 0 24 24" className="mx-1 inline h-[1.1em] w-[1.1em] -translate-y-px align-middle text-p-accent" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 15V3m0 0L8 7m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" strokeLinecap="round" />
    </svg>
  );
}
