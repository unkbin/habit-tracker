# Habit tracker

Monorepo: `server/` (Express + Prisma + Postgres) and `client/` (React + Vite + Tailwind).
See `docs/DECISIONS.md` for the rules the code follows.

## Setup

Requires Node 20+.

```bash
npm install
cp server/.env.example server/.env # then fill in JWT_SECRET (the file says how)
npm run db:generate -w server      # generate the Prisma client
```

Then start a database, either one works:

- **Docker:** `npm run db:up`, then `npm run db:deploy -w server` to apply migrations.
- **No Docker:** `npm run db:local` in its own terminal. It runs PGlite (Postgres in WebAssembly),
  stores data in `server/.data/`, and applies migrations on start. Point `.env` at it as
  `.env.example` describes.

Then, each in its own terminal:

```bash
npm run dev:api   # API on http://localhost:3000
npm run dev:web   # app on http://localhost:5173 (proxies /api to the API)
```

`npm run db:seed -w server` creates a demo account with a month of history; the login is at the
top of `server/scripts/seed-dev.ts`. In development, password reset emails are printed to the API
console.

## Reminders and email

Reminders are Web Push notifications. To try them locally:

1. `npm run push:keys -w server` and paste the two keys into `server/.env`.
2. Build and serve the app (service workers, which receive notifications, only exist in production
   builds): `npm run build -w client`, then `npm run preview -w client` and open
   http://localhost:4173 in Chrome, Edge or Firefox.
3. Settings → Reminders → Turn on notifications, then Send a test.
4. Give a habit a reminder time a minute from now and run `npm run worker -w server`
   (checks every minute), or run `npm run reminders -w server` once after that time.

In production, run the reminder check on a schedule: a cron job running
`npm run reminders -w server` every 5 minutes, or an always-on worker running
`npm run worker -w server`. Each habit is reminded at most once a day however often it runs, and
reminders more than 2 hours late are skipped. iPhone and iPad only deliver web push to apps added to
the Home Screen; the Settings screen explains this.

Password reset emails go through [Resend](https://resend.com) when `RESEND_API_KEY` and
`EMAIL_FROM` are set (required in production); otherwise they're printed to the API console.

The no-Docker PGlite database serves every connection through one Postgres session and sometimes
drops a new connection while another process is connected. The API, worker and scripts retry or can
simply be re-run; for running the API and worker side by side, the Docker Postgres is smoother.

## Tests

```bash
npm test -w server
```

The tests don't need Docker: by default they start an in-memory Postgres (PGlite) and apply the
migrations to it. To run them against a real database instead (e.g. in CI), set
`TEST_DATABASE_URL` to an already-migrated database. The tests empty it before each test.

## Database

`npm run db:migrate -w server` creates a new migration after you edit `server/prisma/schema.prisma`.
Check constraints are hand-written at the bottom of the init migration, since Prisma can't express them.
`npm run db:studio -w server` opens a browser UI for the data.

## API so far

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/signup` | `{ email, password, name?, timezone? }` → `{ accessToken, user }` + refresh cookie |
| POST | `/auth/login` | `{ email, password }` → `{ accessToken, user }` + refresh cookie |
| POST | `/auth/refresh` | refresh cookie → `{ accessToken, user }` + rotated cookie |
| POST | `/auth/logout` | revokes the cookie's session |
| POST | `/auth/forgot-password` | `{ email }` → always 202 |
| POST | `/auth/reset-password` | `{ token, password }` → 204, logs out all devices |
| GET | `/me` | This and everything below need `Authorization: Bearer <accessToken>` |
| PATCH | `/me` | `{ name?, timezone?, weekStartDay?, theme? }` |
| DELETE | `/me` | `{ password }`; deletes the account and all its data |
| GET | `/me/export` | JSON download of all the user's data |
| GET | `/habits?status=` | `active` (default), `archived` or `all` |
| POST | `/habits` | `{ name, icon, color, frequency, targetWeekdays?, timesPerWeek?, targetValue?, unit?, description?, startDate?, reminderTime? }` |
| GET | `/habits/:id` | |
| PATCH | `/habits/:id` | any habit field, plus `archived` |
| DELETE | `/habits/:id` | deletes the habit and its history |
| PATCH | `/habits/reorder` | `{ ids }` |
| POST | `/habits/:id/completions` | `{ date, value?, note? }`; upsert, last 7 days only |
| DELETE | `/habits/:id/completions/:date` | idempotent, last 7 days only |
| GET | `/habits/:id/completions?from=&to=` | defaults to the last 365 days |
| GET | `/habits/:id/stats` | streaks, 7/30/90-day rates, totals, weekday breakdown |
| GET | `/today` | habits due today with done status, streaks and a summary |
| GET | `/stats/overview` | rates, daily/weekly/monthly series, weekdays, habits ranked |
| GET | `/push/public-key` | VAPID public key for subscribing, or null if push isn't configured |
| POST | `/push/subscriptions` | `PushSubscription.toJSON()`; known push services only |
| DELETE | `/push/subscriptions` | `{ endpoint }`; turns this device off |
| POST | `/push/test` | sends a test notification to the user's devices |
| GET | `/health` | |
