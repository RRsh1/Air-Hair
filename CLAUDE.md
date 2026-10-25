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
- `REQUIRE_STAFF_2FA=false` skips 2FA enrollment in local development only (ignored in production).
- Disable staff only through `disableStaff()` (src/lib/staff), which also revokes sessions.
- Auth tables: src/db/auth-schema.ts, regenerated with `npm run auth:schema` (then re-apply the
  auth_ prefix and withTimezone edits described in its header).
- New clinic + first admin: `npm run clinic:create -- --name "..." --slug demo --admin-email ... --admin-name "..."`.

## Patient app (/c/<clinic slug>)
- Patients sign in with national ID + mobile + SMS code (src/lib/patient-auth). Never reveal whether
  a patient exists: an unmatched request stores a decoy challenge (patient_id null) through the same
  queries, the SMS goes out via `after()`, and decoys verify exactly like wrong codes. Limits are keyed
  on the typed (ID, phone) pair; 10 wrong codes a day block that pair. Keep both paths identical.
- Client IPs come only from `clientIpFromHeaders` (src/lib/net): trusted on Vercel, or with
  TRUST_PROXY_HEADERS=1; otherwise null and a shared "unknown" bucket.
- Sessions are our own (patient_sessions), cookie scoped to /c/<slug>; src/proxy.ts slides its lifetime.
- Every patient page calls `requirePatient(slug)` after `await connection()` (time-dependent data).
- The server decides the day of a photo (`anglesOpenNow`, `savePatientPhoto`); the client never does.
- Photos: browser crops to 3:4, resizes to 1600px and re-encodes JPEG (strips EXIF); the server runs
  `sanitizeJpeg` (whole-file walk, drops metadata, nothing after EOI) and stores its output. Saves lock
  the treatment row and re-check the schedule; a file whose DB write fails is deleted. Uploads need a
  same-origin Origin and a Content-Length. Photos are served `no-store` with a sandbox CSP.
  Storage goes through src/lib/storage (local disk in dev, R2 later).
- Patient UI colors come only from theme tokens (src/lib/theme/patient-theme.ts, `bg-p-*` classes).
- SMS: src/lib/notifications/sms.ts prints to the console in development; in production there is no
  provider yet, so patient login is closed for everyone until one is added.

## Local database without Neon
`DATABASE_URL=pglite:.data/pglite` runs everything on an in-process Postgres saved to disk
(`npm run db:migrate:local` first). Useful for end-to-end checks; never used in production.

## Status
Done: foundations, staff auth (TOTP), patient app v1 (login, film-strip timeline, capture with
alignment ghost, day view with comparison), patient-side security review fixes. Next: consent screen, clinic dashboard (patients,
timeline editor, branding), RLS on clinic_id, SMS + email providers, R2 storage.
