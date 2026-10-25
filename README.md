# Hair&Air

Recovery documentation for hair transplant clinics: patients photograph their recovery on a
clinic-defined schedule, follow daily guidance, and the clinic tracks progress from a dashboard.

## Getting started

```bash
npm install
cp .env.example .env.local      # fill DATABASE_URL from the Neon dev branch
npm run keys:generate >> .env.local
npm run db:migrate
npm test
npm run dev
```

## Structure

```
src/
  db/
    schema.ts              all tables (Drizzle)
    client.ts              lazy Neon connection
  lib/
    crypto/                AES-256-GCM field encryption, blind index, OTP hashing
    validation/            Israeli ID, mobile phone, SMS sender name
    clinic-settings/       versioned per-clinic configuration (zod)
    authz/                 capabilities + the single policy engine
    timeline/              day math and capture schedule
drizzle/                   generated SQL migrations
```

See `CLAUDE.md` for the rules every change must follow.
