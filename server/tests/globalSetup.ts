import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/**
 * Gives the tests a migrated Postgres database.
 *
 * With TEST_DATABASE_URL set (e.g. in CI), that database is used as-is and must already be
 * migrated (`prisma migrate deploy`). Otherwise an in-memory PGlite database is started and
 * served over the Postgres wire protocol, so the tests need no Docker or local Postgres.
 */
export default async function setup() {
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    return;
  }

  const db = new PGlite();
  const migrationsDir = join(import.meta.dirname, "../prisma/migrations");
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of migrations) {
    await db.exec(readFileSync(join(migrationsDir, name, "migration.sql"), "utf8"));
  }

  const port = await freePort();
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
  await server.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
  // PGlite is a single Postgres session, so a pooled connection could interleave with another
  // connection's transaction. One connection keeps transactions isolated.
  process.env.DATABASE_POOL_MAX = "1";

  return async () => {
    await server.stop();
    await db.close();
  };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("No port"))));
    });
  });
}
