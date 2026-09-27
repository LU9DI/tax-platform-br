import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.TAX_TEST_DATABASE_URL;

test(
  "tax rule publication race preserves the resolved X version in historical evidence",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const seed = await client.query(`
        SELECT c.id AS company_id, r.id AS rule_x_id, r.code, r.version,
               r.parameters, r.effective_from, r.effective_to
        FROM tax_companies c
        CROSS JOIN tax_rules r
        WHERE r.active=true
        ORDER BY r.effective_from DESC, r.version DESC
        LIMIT 1
      `);

      assert.equal(seed.rowCount, 1);

      const x = seed.rows[0];
      const yId = randomUUID();
      const auditId = randomUUID();
      const idempotencyKey = `rule-race-test-${randomUUID()}`;
      const nextEffectiveFrom = new Date("2099-01-01T00:00:00Z");
      const closedEffectiveTo = new Date("2098-12-31T00:00:00Z");

      // X is the rule resolved by the calculation. Its evidence is captured
      // before Y is published and keeps X's identity/parameters.
      const output = {
        total: 10,
        ruleVersion: {
          id: x.rule_x_id,
          code: x.code,
          version: x.version,
          effectiveFrom: x.effective_from.toISOString().slice(0, 10),
          effectiveTo: x.effective_to
            ? x.effective_to.toISOString().slice(0, 10)
            : null,
          parameters: x.parameters,
        },
      };

      await client.query(
        `INSERT INTO tax_calculation_audits
          (id, company_id, calculation_type, input, output, rule_version_id,
           idempotency_key, request_fingerprint)
         VALUES ($1,$2,'rule_race_test',$3,$4,$5,$6,'rule-race-test')`,
        [
          auditId,
          x.company_id,
          JSON.stringify({ base: 1000 }),
          JSON.stringify(output),
          x.rule_x_id,
          idempotencyKey,
        ],
      );

      // Publishing Y closes X's validity window, but must not alter X's
      // identity or parameters because X is already referenced by evidence.
      await client.query(
        `UPDATE tax_rules
            SET effective_to=$1
          WHERE id=$2`,
        [closedEffectiveTo, x.rule_x_id],
      );

      await client.query(
        `INSERT INTO tax_rules
          (id, code, version, active, effective_from, effective_to,
           tax_year, name, source_url, source_reference, parameters)
         VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          yId,
          x.code,
          Number(x.version) + 1,
          true,
          nextEffectiveFrom,
          null,
          Number(x.version) + 1,
          "Rule race integration test",
          "https://example.invalid/rule-race-test",
          "test-only",
          JSON.stringify(x.parameters),
        ],
      );

      const audit = await client.query(
        `SELECT rule_version_id, output
           FROM tax_calculation_audits
          WHERE id=$1`,
        [auditId],
      );

      const published = await client.query(
        `SELECT id, version, effective_from
           FROM tax_rules
          WHERE id=$1`,
        [yId],
      );

      assert.equal(audit.rows[0].rule_version_id, x.rule_x_id);
      assert.equal(audit.rows[0].output.ruleVersion.id, x.rule_x_id);
      assert.equal(audit.rows[0].output.ruleVersion.version, Number(x.version));
      assert.deepEqual(audit.rows[0].output.ruleVersion.parameters, x.parameters);
      assert.equal(published.rows[0].id, yId);
      assert.equal(Number(published.rows[0].version), Number(x.version) + 1);

      // All writes are rolled back; this test never leaves synthetic data in
      // the test database. Never point TAX_TEST_DATABASE_URL at production.
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  },
);
