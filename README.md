# Habit tracker

Monorepo: `server/` (Express + Prisma + Postgres). The React frontend (`client/`) comes in step 5.
See `docs/DECISIONS.md` for the rules the code follows.

## Setup

Requires Node 20+ and Docker.

```bash
npm install
npm run db:up                      # start Postgres 17 in Docker
cp server/.env.example server/.env # then fill in JWT_SECRET (the file says how)
npm run db:deploy -w server        # apply migrations
npm run db:generate -w server      # generate the Prisma client
npm run dev -w server              # API on http://localhost:3000
```

In development, password reset emails are printed to the server console.

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
| GET | `/health` | |
