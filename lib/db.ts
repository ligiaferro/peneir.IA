import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";

type DatabaseGlobal = typeof globalThis & { __peneirDbPool?: Pool };
type DatabaseRole = "authenticated" | null;

const globalForDatabase = globalThis as DatabaseGlobal;

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Configure DATABASE_URL com a URI PostgreSQL do Supabase.");
  }

  if (!globalForDatabase.__peneirDbPool) {
    const connectionUrl = new URL(connectionString);
    const sslMode = connectionUrl.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      connectionUrl.searchParams.set("sslmode", "verify-full");
    }
    const rootCertificatePath = process.env.DATABASE_SSL_ROOT_CERT_PATH;
    if (rootCertificatePath) {
      connectionUrl.searchParams.set(
        "sslrootcert",
        resolve(process.cwd(), rootCertificatePath),
      );
    }

    globalForDatabase.__peneirDbPool = new Pool({
      connectionString: connectionUrl.toString(),
      max: process.env.NODE_ENV === "production" ? 1 : 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForDatabase.__peneirDbPool;
}

async function withRole<T>(
  role: DatabaseRole,
  userId: string | null,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  let transactionStarted = false;
  let discardConnection = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;
    if (role) {
      await client.query(`SET LOCAL ROLE ${role}`);
      await client.query(
        "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
        [
          userId,
          JSON.stringify({ sub: userId, role }),
        ],
      );
    }

    const result = await operation(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        discardConnection = true;
        throw new AggregateError(
          [error, rollbackError],
          "Database operation and rollback both failed.",
        );
      }
    }
    throw error;
  } finally {
    client.release(discardConnection);
  }
}

export function withUserDb<T>(
  userId: string,
  operation: (client: PoolClient) => Promise<T>,
) {
  return withRole("authenticated", userId, operation);
}

export function withServiceDb<T>(
  operation: (client: PoolClient) => Promise<T>,
) {
  return withRole(null, null, operation);
}
