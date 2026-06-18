/**
 * Copy all public table data from local DB to Azure DB.
 * Usage (env): LOCAL_DATABASE_URL, PGHOST/PGUSER/PGPASSWORD/PGDATABASE for Azure
 */
const { Pool } = require("../backend/node_modules/pg");

const LOCAL_URL = process.env.LOCAL_DATABASE_URL;
const CONFIRM_FLAG = process.env.CONFIRM_DESTRUCTIVE_SYNC;

function azurePool() {
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    return new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
  }
  return new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "booking_app_db",
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

// Insert order respects typical FK chains
const TABLE_ORDER = [
  "companies",
  "users",
  "email_whitelist",
  "rooms",
  "room_photos",
  "bookings",
  "booking_comments",
  "pending_registrations",
  "verification_codes",
];

async function getTables(pool) {
  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return rows.map((r) => r.table_name);
}

async function getColumnMeta(pool, table) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, udt_name, is_generated
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Map(rows.map((r) => [r.column_name, r]));
}

function insertableColumns(rowKeys, azureMeta) {
  return rowKeys.filter((c) => {
    const meta = azureMeta.get(c);
    return meta && meta.is_generated !== "ALWAYS";
  });
}

function serializeValue(meta, value) {
  if (value === null || value === undefined) return null;
  const t = meta.data_type;
  const u = meta.udt_name;
  if (t === "json" || t === "jsonb" || u === "json" || u === "jsonb") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return value;
}

async function main() {
  if (!LOCAL_URL) {
    throw new Error("LOCAL_DATABASE_URL is required.");
  }
  if (CONFIRM_FLAG !== "YES") {
    throw new Error("Refusing destructive sync. Set CONFIRM_DESTRUCTIVE_SYNC=YES to continue.");
  }
  if (!process.env.DATABASE_URL && (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGPASSWORD)) {
    throw new Error("Target Azure DB credentials are required (DATABASE_URL or PGHOST/PGUSER/PGPASSWORD).");
  }

  const local = new Pool({ connectionString: LOCAL_URL });
  const azure = azurePool();

  try {
    console.log("Local:", LOCAL_URL.replace(/:[^:@]+@/, ":****@"));
    const localTables = await getTables(local);
    const azureTables = await getTables(azure);
    console.log("Local tables:", localTables.join(", "));

    const ordered = [
      ...TABLE_ORDER.filter((t) => localTables.includes(t)),
      ...localTables.filter((t) => !TABLE_ORDER.includes(t)),
    ];

    const toCopy = ordered.filter((t) => azureTables.includes(t));
    const { rows: counts } = await local.query(
      toCopy
        .map(
          (t) =>
            `(SELECT '${t}' AS t, COUNT(*)::int AS c FROM "${t}")`
        )
        .join(" UNION ALL ")
    );
    for (const { t, c } of counts) {
      console.log(`  local ${t}: ${c} rows`);
    }

    const client = await azure.connect();
    try {
      await client.query("BEGIN");
      const truncateList = [...toCopy].reverse().map((t) => `"${t}"`).join(", ");
      if (truncateList) {
        await client.query(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);
      }
      for (const table of toCopy) {
        const { rows } = await local.query(`SELECT * FROM "${table}"`);
        if (rows.length === 0) {
          console.log(`  skip ${table} (empty)`);
          continue;
        }
        const localMeta = await getColumnMeta(local, table);
        const azureMeta = await getColumnMeta(azure, table);
        const cols = insertableColumns(Object.keys(rows[0]), azureMeta);
        const colList = cols.map((c) => `"${c}"`).join(", ");
        for (const row of rows) {
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
          const values = cols.map((c) =>
            serializeValue(localMeta.get(c), row[c])
          );
          await client.query(
            `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`,
            values
          );
        }
        console.log(`  OK ${table}: ${rows.length} rows`);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    console.log("Done.");
  } finally {
    await local.end();
    await azure.end();
  }
}

main().catch((err) => {
  console.error("Copy failed:", err.message);
  process.exit(1);
});
