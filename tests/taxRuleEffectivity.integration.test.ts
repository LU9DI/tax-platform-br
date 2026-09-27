import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.TAX_TEST_DATABASE_URL;

test(
  "tax rule effectivity rejects invalid and overlapping active periods",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });

    try {
      const seed = await pool.query(`
        SELECT id, code, version, tax_year, name, source_url, source_reference, parameters,
               effective_from::text AS effective_from,
               effective_to::text AS effective_to
        FROM tax_rules
        WHERE active=true AND effective_to IS NOT NULL
        ORDER BY effective_from DESC, version DESC
        LIMIT 1
      `);

      assert.equal(seed.rowCount, 1);
      const x = seed.rows[0];

      const insertRule = async (effectiveFrom: string, effectiveTo: string | null) => {
        await pool.query(
          `INSERT INTO tax_rules
             (id, code, version, active, effective_from, effective_to, tax_year,
              name, source_url, source_reference, parameters)
           VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10)`,
          [
            randomUUID(),
            x.code,
            `effectivity-test-${randomUUID()}`,
            effectiveFrom,
            effectiveTo,
            x.tax_year,
            "Effectivity integration test",
            "https://example.invalid/effectivity-test",
            "test-only",
            JSON.stringify(x.parameters),
          ],
        );
      };

      await assert.rejects(
        insertRule("2026-12-31", "2026-01-01"),
        /invalid effective period/,
      );

      await assert.rejects(
        insertRule(x.effective_from, x.effective_to),
        /overlapping active validity period/,
      );
    } finally {
      await pool.end();
    }
  },
);
