import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrationsDir = path.resolve("prisma", "migrations");

function sqlitePathFromDatabaseUrl(value) {
  const fallback = path.resolve("prisma", "dev.db");
  if (!value?.startsWith("file:")) {
    return fallback;
  }

  const filePath = value.slice("file:".length);
  return path.isAbsolute(filePath) ? filePath : path.resolve("prisma", filePath.replace(/^\.\//, ""));
}

const dbPath = sqlitePathFromDatabaseUrl(process.env.DATABASE_URL);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const migrationFiles = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join("prisma", "migrations", entry.name, "migration.sql"))
  .filter((filePath) => fs.existsSync(filePath))
  .sort();

for (const filePath of migrationFiles) {
  const migrationName = path.basename(path.dirname(filePath));
  const db = new DatabaseSync(dbPath);

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS "_LocalMigration" (
        "name" TEXT NOT NULL PRIMARY KEY,
        "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const applied = db.prepare('SELECT "name" FROM "_LocalMigration" WHERE "name" = ?').get(migrationName);
    if (applied) {
      console.log(`Migration already applied: ${migrationName}`);
      continue;
    }

    db.exec(fs.readFileSync(filePath, "utf8"));
    db.prepare('INSERT INTO "_LocalMigration" ("name") VALUES (?)').run(migrationName);
    console.log(`Applied migration: ${migrationName}`);
  } finally {
    db.close();
  }
}
