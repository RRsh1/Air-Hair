import { maskPhone, type NormalizedMobile } from "../validation/phone";

/**
 * Outgoing SMS. The provider is chosen later; this interface is all the app depends on.
 * Development prints messages to the server console (with the number masked). Production
 * refuses until a provider is configured, so codes are never silently dropped.
 */
export interface SmsProvider {
  send(message: { to: NormalizedMobile; sender: string; text: string }): Promise<void>;
}

export const consoleSms: SmsProvider = {
  async send({ to, sender, text }) {
    console.info(`[dev sms] from ${sender} to ${maskPhone(to)}: ${text}`);
  },
};

export function getSmsProvider(): SmsProvider {
  if (process.env.NODE_ENV !== "production") return consoleSms;
  return {
    async send() {
      throw new Error("SMS provider is not configured");
    },
  };
}
