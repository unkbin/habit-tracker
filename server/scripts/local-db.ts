// A Postgres for local development without Docker: PGlite (Postgres compiled to WebAssembly),
// stored in server/.data/pglite and served over the Postgres protocol on localhost:5433.
// Migrations are applied on start. Run it in its own terminal, then `npm run dev` with
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable"
//   DATABASE_POOL_MAX=1
// in .env. For anything closer to production, use the Docker Postgres instead.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);
const dataDir = join(import.meta.dirname, "../.data/pglite");
mkdirSync(dataDir, { recursive: true });

const db = new PGlite(dataDir);
const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
await server.start();

const url = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;
// Must not block (no execSync): this process is also the database the migration connects to.
await new Promise<void>((resolve, reject) => {
  spawn("npx prisma migrate deploy", {
    cwd: join(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
    shell: true,
  }).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`prisma migrate deploy exited with ${code}`))));
});
console.info(`\nLocal database ready at ${url}\nData is stored in ${dataDir}. Ctrl+C to stop.`);

async function shutdown() {
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
