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
   phone go through `encryptField(value, { context, rowId })` (src/lib/crypto). Generate the
   patient UUID in the app (`crypto.randomUUID()`) before encrypting, because the ciphertext is
   bound to its row. Lookups use `nationalIdIndex` / `phoneIndex`, which only accept the branded
   output of `normalizeIsraeliId` / `normalizeIsraeliMobile`. Never pass these values to
   console.log, error messages, analytics or Sentry.
2. **Every access decision goes through src/lib/authz/policy.ts** (`canStaff`, `canAccessPatient`,
   `patientScope`). Decisions are capabilities only, never `role === "doctor"`. A `{ kind: "none" }`
   scope must become `WHERE false`. Staff roles today: `admin` and `doctor` (a receptionist uses
   `doctor`). To add a role, follow the steps at the top of src/lib/authz/capabilities.ts.
3. **Clinic behaviour is configuration, not code.** Anything that may differ between clinics is a
   field in src/lib/clinic-settings/schema.ts with a `.default()`. Read settings only through
   `parseClinicSettings()`. Breaking changes bump the version and add a migration step.
4. **Phase is recorded, day numbers are derived.** A new journal entry stores
   `phaseForNewEntry(timing)`; that phase is authoritative forever. Post-op day numbers come from
   `entryPosition()` (captured_at + actual surgery date, clinic time zone) and are never stored.
5. **Every query on tenant data is scoped by clinic_id**, and links between tenant rows use composite
   foreign keys that include clinic_id. Patient login is scoped to one clinic (blind indexes are per clinic).
6. **Photos are stored clean.** The clinic logo is overlaid at display time and burned in only on export.
   Deleting a patient goes through a deletion service that removes stored files (photos, signatures)
   before the DB row; FK cascades alone leave files behind.
7. **Timeline content is structured JSON, never raw HTML.**
8. Writes that view or change patient data append to `audit_log` (no identifying data in metadata).

## Commands
- `npm test` — unit tests (crypto, validation, authz, settings, timeline)
- `npm run typecheck`
- `npm run db:generate -- --name <change>` then `npm run db:migrate` (dev branch only).
  Check generated SQL: drizzle-kit can emit composite FKs before the unique indexes they need.
- `npm run keys:generate` — fresh encryption keys for .env.local

## Staff authentication
- Better Auth, staff only (src/lib/auth/build-auth.ts). Patients never get a Better Auth account.
- Every dashboard page and server action calls `requireStaff()`; src/proxy.ts is only an
  optimistic cookie redirect. With cacheComponents, session reads live inside `<Suspense>`.
- TOTP is mandatory; a non-enrolled session may only reach /clinic/setup-2fa. Completing
  enrollment revokes the user's other sessions. Sessions are only created for active staff.
- Disable staff only through `disableStaff()` (src/lib/staff), which also revokes sessions.
- Auth tables: src/db/auth-schema.ts, regenerated with `npm run auth:schema` (then re-apply the
  auth_ prefix and withTimezone edits described in its header).
- New clinic + first admin: `npm run clinic:create -- --name "..." --admin-email ... --admin-name "..."`.

## Status
Done: foundations (schema, encryption, authz, settings, timeline math) and staff auth with
mandatory TOTP. Next: RLS policies on clinic_id, email provider for password links, patient
management + patient OTP login, SMS provider interface, private photo storage.
