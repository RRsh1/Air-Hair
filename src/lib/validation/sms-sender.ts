import { z } from "zod";

/**
 * Alphanumeric SMS sender ID: up to 11 Latin letters, digits or spaces,
 * with at least one letter (carriers reject digit-only alphanumeric senders).
 * Confirm the exact rules with the chosen SMS provider.
 */
export const smsSenderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(11, "Sender name can be at most 11 characters")
  .regex(/^[A-Za-z0-9 ]+$/, "Only English letters, digits and spaces")
  .regex(/[A-Za-z]/, "Must include at least one English letter");
