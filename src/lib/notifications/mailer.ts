/**
 * Outgoing email. The provider is not chosen yet, so development prints links to the server
 * console and production refuses loudly instead of silently dropping a password link.
 * Swap the body of sendPasswordLink for the provider's SDK once it is picked.
 */
export async function sendPasswordLink({ email, url }: { email: string; url: string }): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[dev mail] password link for ${email}:\n${url}`);
    return;
  }
  throw new Error("Email provider is not configured; cannot send password link");
}
