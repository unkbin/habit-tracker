# Habit tracker

Monorepo: `server/` (Express + Prisma + Postgres). The React frontend (`client/`) comes in step 5.
See `docs/DECISIONS.md` for the rules the code follows.

## Database setup

Requires Node 20+ and Docker.

```bash
npm install
npm run db:up                      # start Postgres 17 in Docker
cp server/.env.example server/.env
npm run db:deploy -w server        # apply migrations
npm run db:generate -w server      # generate the Prisma client
```

`npm run db:migrate -w server` creates a new migration after you edit `server/prisma/schema.prisma`.
Check constraints are hand-written at the bottom of the init migration, since Prisma can't express them.
`npm run db:studio -w server` opens a browser UI for the data.
