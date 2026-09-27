import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { recordTaxCalculation } from "../src/services/taxAuditService.js";

const databaseUrl = process.env.TAX_TEST_DATABASE_URL;

test(
  "tax audit service returns one persisted result under concurrent idempotent requests",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });

    try {
      const seed = await pool.query(`
        SELECT c.id AS company_id,
               c.user_id,
               r.id AS rule_version_id,
               r.code,
               r.version,
               r.effective_from::text AS effective_from,
               r.effective_to::text AS effective_to,
               r.parameters
        FROM tax_companies c
        CROSS JOIN tax_rules r
        WHERE r.active=true
        ORDER BY r.effective_from DESC, r.version DESC
        LIMIT 1
      `);

      assert.equal(seed.rowCount, 1);
      const x = seed.rows[0];
      const key = `service-concurrency-${randomUUID()}`;
      const input = { base: 1000, month: 9 };
      const output = {
        total: 10,
        ruleVersion: {
          id: x.rule_version_id,
          code: x.code,
          version: x.version,
          effectiveFrom: x.effective_from,
          effectiveTo: x.effective_to,
          parameters: x.parameters,
        },
      };

      const [first, second] = await Promise.all([
        recordTaxCalculation(x.company_id, x.user_id, "service_concurrency_test", input, output, x.rule_version_id, key),
        recordTaxCalculation(x.company_id, x.user_id, "service_concurrency_test", input, output, x.rule_version_id, key),
      ]);

      assert.ok(first);
      assert.ok(second);
      assert.equal(first.id, second.id);

      const persisted = await pool.query(
        `SELECT count(*)::int AS count
         FROM tax_calculation_audits
         WHERE company_id=$1 AND calculation_type='service_concurrency_test' AND idempotency_key=$2`,
        [x.company_id, key],
      );
      assert.equal(Number(persisted.rows[0].count), 1);

      await assert.rejects(
        recordTaxCalculation(
          x.company_id,
          x.user_id,
          "service_concurrency_test",
          { ...input, base: 1001 },
          output,
          x.rule_version_id,
          key,
        ),
        (error: unknown) =>
          Boolean(error) &&
          typeof error === "object" &&
          (error as { code?: string }).code === "IDEMPOTENCY_CONFLICT",
      );

      const afterConflict = await pool.query(
        `SELECT count(*)::int AS count
         FROM tax_calculation_audits
         WHERE company_id=$1 AND calculation_type='service_concurrency_test' AND idempotency_key=$2`,
        [x.company_id, key],
      );
      assert.equal(Number(afterConflict.rows[0].count), 1);
    } finally {
      await pool.end();
    }
  },
);
