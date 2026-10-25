/**
 * True when a state-changing request comes from our own pages: the browser's Origin header
 * (always sent on fetch POSTs) must match the host the request was sent to.
 */
export function isSameOrigin(request: { headers: { get(name: string): string | null } }): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
