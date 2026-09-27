import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initDb } from "../src/core/db.js";

const db = initDb();
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

async function verifyMigrationIntegrity(client: any) {
  const expected = files.map((file) => file.replace(/\.sql$/, ""));
  const applied = await client.query("SELECT version FROM schema_migrations ORDER BY version");
  const appliedSet = new Set(applied.rows.map((row: { version: string }) => row.version));

  const pending = expected.filter((version) => !appliedSet.has(version));
  if (pending.length) {
    throw new Error(`migration integrity check failed: pending migrations: ${pending.join(", ")}`);
  }

  const appliedVersions = Array.from(appliedSet) as string[];
  const orphaned = appliedVersions.filter((version) => !expected.includes(version));
  if (orphaned.length) {
    throw new Error(`migration integrity check failed: applied migrations missing from repository: ${orphaned.join(", ")}`);
  }
}

async function verifyTaxRuleIntegrity(client: any) {
  const ambiguous = await client.query(
    `SELECT code, count(*)::int AS count
       FROM tax_rules
      WHERE active=true
        AND effective_from <= CURRENT_DATE
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      GROUP BY code
     HAVING count(*) <> 1`,
  );
  if (ambiguous.rowCount) {
    throw new Error(
      `tax rule integrity check failed: expected exactly one effective active rule per code; ambiguous/missing codes: ${JSON.stringify(ambiguous.rows)}`,
    );
  }

  const invalid = await client.query(
    `SELECT code, version
       FROM tax_rules
      WHERE effective_to IS NOT NULL
        AND effective_to < effective_from
      LIMIT 10`,
  );
  if (invalid.rowCount) {
    throw new Error(
      `tax rule integrity check failed: invalid effective periods: ${JSON.stringify(invalid.rows)}`,
    );
  }

  const year = new Date().getUTCFullYear();
  const required = [
    {
      code: `MEI_${year}`,
      predicate: "annual_limit > 0 AND monthly_das_valid",
    },
    {
      code: `RTC_CONSUMPTION_${year}`,
      predicate: "cbs_rate >= 0 AND ibs_rate >= 0",
    },
  ];

  for (const rule of required) {
    const row = await client.query(
      "SELECT code, version, parameters FROM tax_rules WHERE code=$1 AND active=true AND effective_from <= CURRENT_DATE AND (effective_to IS NULL OR effective_to >= CURRENT_DATE) LIMIT 1",
      [rule.code],
    );
    if (!row.rowCount) {
      throw new Error(`tax rule integrity check failed: required current rule not found: ${rule.code}`);
    }

    const parameters = row.rows[0].parameters;
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
      throw new Error(`tax rule integrity check failed: parameters must be a JSON object: ${rule.code}`);
    }

    if (rule.code.startsWith("MEI_")) {
      const annualLimit = Number(parameters.annual_limit);
      const das = parameters.monthly_das;
      if (!Number.isFinite(annualLimit) || annualLimit <= 0 || !das || typeof das !== "object") {
        throw new Error(`tax rule integrity check failed: invalid MEI parameters: ${rule.code}`);
      }
      for (const activity of ["commerce", "services", "commerce_services"]) {
        if (!Number.isFinite(Number(das[activity])) || Number(das[activity]) < 0) {
          throw new Error(`tax rule integrity check failed: invalid MEI DAS for ${rule.code}/${activity}`);
        }
      }
    } else {
      const cbs = Number(parameters.cbs_rate);
      const ibs = Number(parameters.ibs_rate);
      if (!Number.isFinite(cbs) || cbs < 0 || !Number.isFinite(ibs) || ibs < 0) {
        throw new Error(`tax rule integrity check failed: invalid RTC parameters: ${rule.code}`);
      }
    }
  }
}

const client = await db.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  await client.query("SELECT pg_advisory_lock(hashtext('application_migrations'))");

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [version]);
    if (applied.rowCount) continue;

    const sql = await readFile(join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT(version) DO NOTHING",
        [version],
      );
      await client.query("COMMIT");
      console.log("migration applied:", version);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  await verifyMigrationIntegrity(client);
  await verifyTaxRuleIntegrity(client);
  console.log(`database integrity verified: ${files.length} migrations; current tax rules valid`);
} catch (error) {
  console.error("database migration/integrity check failed", error);
  process.exitCode = 1;
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('application_migrations'))").catch(() => {});
  client.release();
  await db.end();
}
