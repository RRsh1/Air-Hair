/**
 * The patient app's service worker. It caches nothing (patient data must never sit in a cache);
 * it only answers a page request that fails for lack of network with a short offline notice.
 * Its presence is what lets browsers offer to install the app.
 */
const script = `
const OFFLINE = '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>אין חיבור</title><body style="font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f2f5f6;color:#13232b"><main style="max-width:28ch;padding:24px;text-align:center"><h1 style="font-size:1.4rem">אין חיבור לאינטרנט</h1><p style="line-height:1.6;color:#4f6470">התיעוד שלך שמור במרפאה. כשהחיבור יחזור, אפשר לפתוח שוב את האפליקציה.</p></main></body></html>';
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { "content-type": "text/html; charset=utf-8" } })));
});
`;

export function GET() {
  return new Response(script, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" },
  });
}
