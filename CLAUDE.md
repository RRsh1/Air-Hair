@AGENTS.md

# Hair&Air — project rules for Claude Code

Recovery documentation platform for hair transplant clinics. Patients photograph their
recovery on a schedule (3 angles: front, top, back); clinics control the timeline,
branding and permissions. Product spec: https://claude.ai/artifact/Sz5w2BtykUsz3PStoc2F8b

## Stack
Next.js (App Router, see AGENTS.md: read node_modules/next/dist/docs before using Next APIs),
TypeScript strict, Tailwind, Drizzle ORM + Neon Postgres (EU, Frankfurt), zod, vitest.

## Non-negotiable rules
1. **Patient identifiers are never stored or logged in plain text.** Full name, national ID and
   phone go through `encryptField` (src/lib/crypto). Lookups use `blindIndex` on the
   *normalized* value (`normalizeIsraeliId`, `normalizeIsraeliMobile`). Never pass these values
   to console.log, error messages, analytics or Sentry.
2. **Every access decision goes through src/lib/authz/policy.ts** (`canStaff`, `canAccessPatient`,
   `patientScope`). Never check `role === "doctor"` in a page or action.
3. **Clinic behaviour is configuration, not code.** Anything that may differ between clinics is a
   field in src/lib/clinic-settings/schema.ts with a `.default()`. Read settings only through
   `parseClinicSettings()`. Breaking changes bump the version and add a migration step.
4. **Day numbers are derived, never stored.** Use src/lib/timeline/days.ts. Day 0 = actual surgery
   date, set when the clinic marks the surgery performed. Pre-op photos have no day number.
5. **Every query on tenant data is scoped by clinic_id.** Patient lists use `patientScope()`.
6. **Photos are stored clean.** The clinic logo is overlaid at display time and burned in only on export.
7. **Timeline content is structured JSON, never raw HTML.**
8. Writes that view or change patient data append to `audit_log` (no identifying data in metadata).

## Commands
- `npm test` — unit tests (crypto, validation, authz, settings, timeline)
- `npm run typecheck`
- `npm run db:generate -- --name <change>` then `npm run db:migrate` (dev branch only)
- `npm run keys:generate` — fresh encryption keys for .env.local

## Status
Phase 1 (foundations) done: schema, encryption, authz engine, clinic settings, timeline math.
Next: staff auth (Better Auth + mandatory TOTP), RLS policies on clinic_id, patient OTP login,
SMS provider interface, private photo storage (Cloudflare R2, signed URLs).
