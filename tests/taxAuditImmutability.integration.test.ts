import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.TAX_TEST_DATABASE_URL;

test(
  "referenced tax rules and historical audits are immutable",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });

    try {
      const seed = await pool.query(`
        SELECT c.id AS company_id,
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
      const auditId = randomUUID();
      const key = `immutability-test-${randomUUID()}`;

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

      await pool.query(
        `INSERT INTO tax_calculation_audits
          (id, company_id, calculation_type, input, output, rule_version_id, idempotency_key, request_fingerprint)
         VALUES ($1,$2,'immutability_test',$3,$4,$5,$6,'immutability-test')`,
        [
          auditId,
          x.company_id,
          JSON.stringify({ base: 1000 }),
          JSON.stringify(output),
          x.rule_version_id,
          key,
        ],
      );

      await assert.rejects(
        pool.query(
          `UPDATE tax_rules SET parameters=$1 WHERE id=$2`,
          [JSON.stringify({ ...x.parameters, hardening_test: true }), x.rule_version_id],
        ),
        /referenced tax rule identity\/parameters are immutable/,
      );

      await assert.rejects(
        pool.query(
          `DELETE FROM tax_rules WHERE id=$1`,
          [x.rule_version_id],
        ),
        /update or delete on table "tax_rules" violates foreign key constraint|referenced/,
      );

      await assert.rejects(
        pool.query(
          `UPDATE tax_calculation_audits SET output=$1 WHERE id=$2`,
          [JSON.stringify({ tampered: true }), auditId],
        ),
        /tax_calculation_audits is append-only/,
      );

      await assert.rejects(
        pool.query(
          `DELETE FROM tax_calculation_audits WHERE id=$1`,
          [auditId],
        ),
        /tax_calculation_audits is append-only/,
      );
    } finally {
      await pool.end();
    }
  },
);
