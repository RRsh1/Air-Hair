import { maskPhone, type NormalizedMobile } from "../validation/phone";

/**
 * Outgoing SMS. The provider is chosen later; this interface is all the app depends on.
 * Development prints messages to the server console (with the number masked). In production
 * there is no provider yet, so getSmsProvider() returns null and patient login is closed for
 * everyone alike (never per patient, which would reveal who exists).
 */
export interface SmsProvider {
  send(message: { to: NormalizedMobile; sender: string; text: string }): Promise<void>;
}

export const consoleSms: SmsProvider = {
  async send({ to, sender, text }) {
    console.info(`[dev sms] from ${sender} to ${maskPhone(to)}: ${text}`);
  },
};

/** SMS_DRIVER picks the provider: "console" (development only, the default there). */
export function getSmsProvider(env: { NODE_ENV?: string; SMS_DRIVER?: string } = process.env): SmsProvider | null {
  const driver = env.SMS_DRIVER ?? (env.NODE_ENV === "production" ? "" : "console");
  if (driver === "console" && env.NODE_ENV !== "production") return consoleSms;
  return null;
}
