import type { Client as PgClient } from "pg";

const migrationLock = [1_248_714_579, 1_145_130_835] as const;

function getDatabaseConnectionString() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Configure DATABASE_URL with a Supabase PostgreSQL connection string to apply migrations at startup.",
    );
  }

  const connectionUrl = new URL(connectionString);
  const sslMode = connectionUrl.searchParams.get("sslmode");
  if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
    connectionUrl.searchParams.set("sslmode", "verify-full");
  }

  return connectionUrl.toString();
}

async function baselineExistingSchema(client: PgClient) {
  const { rows } = await client.query<{
    existing_objects: boolean;
    complete_schema: boolean;
  }>(`
    SELECT
      (
        to_regclass('public.profiles') IS NOT NULL
        OR to_regclass('public.documents') IS NOT NULL
        OR to_regclass('public.document_analyses') IS NOT NULL
        OR to_regclass('public.notification_deliveries') IS NOT NULL
      ) AS existing_objects,
      (
        to_regclass('public.profiles') IS NOT NULL
        AND to_regclass('public.documents') IS NOT NULL
        AND to_regclass('public.document_analyses') IS NOT NULL
        AND to_regclass('public.notification_deliveries') IS NOT NULL
        AND to_regprocedure('public.claim_opportunity_notification(uuid,text)') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM storage.buckets WHERE id = 'documents'
        )
      ) AS complete_schema
  `);
  const schema = rows[0];

  if (schema.existing_objects && !schema.complete_schema) {
    throw new Error(
      "A partial existing schema was found. Reconcile it with supabase/migrations/0001_initial_schema.sql before starting the application.",
    );
  }
  if (schema.complete_schema) {
    await client.query(
      `INSERT INTO public.app_schema_migrations (version)
       VALUES ('0001_initial_schema.sql')
       ON CONFLICT (version) DO NOTHING`,
    );
  }
}

export async function applyMigrations() {
  const connectionString = getDatabaseConnectionString();
  const { readdir, readFile } = await import(
    /* webpackIgnore: true */ "node:fs/promises"
  );
  const path = await import(/* webpackIgnore: true */ "node:path");
  const migrationDirectory = path.join(
    process.cwd(),
    "supabase",
    "migrations",
  );
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
  const { Client } = await import(/* webpackIgnore: true */ "pg");
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [
      ...migrationLock,
    ]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.app_schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await baselineExistingSchema(client);

    const { rows: appliedRows } = await client.query<{ version: string }>(
      "SELECT version FROM public.app_schema_migrations",
    );
    const appliedVersions = new Set(appliedRows.map((row) => row.version));

    for (const file of migrationFiles) {
      if (appliedVersions.has(file)) continue;

      const sql = await readFile(path.join(migrationDirectory, file), "utf8");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.app_schema_migrations (version) VALUES ($1)",
          [file],
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to apply migration ${file}: ${detail}`);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Migration failed and its transaction could not be rolled back.",
      );
    }
    throw error;
  } finally {
    await client.end();
  }
}
