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
- Every patient page calls `requireConsentedPatient(slug)` (src/lib/legal/server.ts) after
  `await connection()`; only the consent page itself uses `requirePatient`. Uploads refuse
  unconsented patients too.
- Consent and privacy policy (src/lib/legal): each clinic publishes versions as text or PDF; the newest
  published is current. A patient signs the current consent (drawn signature PNG + content hash, IP,
  browser); a new version asks everyone again. No published consent document → nothing to sign.
  Until the dashboard upload screen exists, publish with
  `npx tsx --conditions=react-server scripts/publish-legal.ts --clinic demo --kind consent --text scripts/samples/consent-sample.txt`.
- The server decides the day of a photo (`anglesOpenNow`, `savePatientPhoto`); the client never does.
- Photos: browser crops to 3:4, resizes to 1600px and re-encodes JPEG (strips EXIF); the server runs
  `sanitizeJpeg` (whole-file walk, drops metadata, nothing after EOI) and stores its output. Saves lock
  the treatment row and re-check the schedule; a file whose DB write fails is deleted. Uploads need a
  same-origin Origin and a Content-Length. Photos are served `no-store` with a sandbox CSP.
  Storage goes through src/lib/storage (local disk in dev, R2 later).
- Patient UI design is data (src/lib/theme/patient-theme.ts): a palette of up to 10 named swatches,
  blocks (base, header, hero, ruler, timeline, capture, guidance, button, footer) that pick swatches
  for their roles plus a variant, typography (curated Hebrew faces, src/lib/theme/fonts.ts) and logo
  settings. Roles compile to CSS variables `--<block>-<role>` used as Tailwind colors (`text-gd-heading`,
  `bg-tl-film`…); components never hard-code colors. Block components live in
  src/components/patient/blocks and src/components/patient/timeline and are pure (no data fetching),
  so the coming editor preview can render them with a draft theme.
- Timeline views: film, journal, gallery, calendar, cards. The clinic enables an ordered list (first is
  the default); the patient can switch, remembered per device.
- Every patient photo goes through `Photo` (src/components/patient/photo.tsx), which overlays the clinic
  logo (hidden on tiny thumbnails via container queries). Downloads burn the logo in client-side
  (`downloadWithLogo`); stored files stay clean.
- Themes are refused when text fails WCAG contrast in any block (`themeIssues`). Presets: src/lib/theme/presets.ts.
  Until the dashboard editor exists, publish with
  `npx tsx --conditions=react-server scripts/publish-branding.ts --clinic demo --preset granite --logo scripts/samples/logo-sample.png`.
- If patient styles look stale in `next dev`, stop it and delete `.next` (Turbopack's Tailwind cache).
- SMS: src/lib/notifications/sms.ts prints to the console in development; in production there is no
  provider yet, so patient login is closed for everyone until one is added.

## Local database without Neon
`DATABASE_URL=pglite:.data/pglite` runs everything on an in-process Postgres saved to disk
(`npm run db:migrate:local` first). Useful for end-to-end checks; never used in production.

## Status
Done: foundations, staff auth (TOTP), patient app v1 (login, film-strip timeline, capture with
alignment ghost, day view with comparison), patient-side security review fixes, consent signing + privacy policy page, patient design v2 (block themes, five timeline views,
logo on every photo + download).
Next: clinic dashboard (patients incl. signed consents, document upload, timeline editor, branding editor
with live preview), RLS on clinic_id, SMS + email providers, R2 storage.
