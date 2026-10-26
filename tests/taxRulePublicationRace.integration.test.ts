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
    const resolver = await pool.connect();
    const publisher = await pool.connect();

    try {
      const seed = await resolver.query(`
        SELECT c.id AS company_id,
               r.id AS rule_x_id,
               r.code,
               r.version,
               r.tax_year,
               r.parameters,
               r.effective_from::text AS effective_from,
               r.effective_to::text AS effective_to
        FROM tax_companies c
        CROSS JOIN tax_rules r
        WHERE r.active=true
          AND r.effective_to IS NOT NULL
        ORDER BY r.effective_from DESC, r.version DESC
        LIMIT 1
      `);

      assert.equal(seed.rowCount, 1);

      const x = seed.rows[0];
      const yId = randomUUID();
      const auditId = randomUUID();
      const idempotencyKey = `rule-race-test-${randomUUID()}`;
      const xEffectiveTo = new Date(`${x.effective_to}T00:00:00Z`);
      const yEffectiveFrom = new Date(xEffectiveTo.getTime() + 24 * 60 * 60 * 1000);
      const versionMatch = String(x.version).match(/^(.*?)(\\d+)$/);
      const nextVersion = versionMatch
        ? `${versionMatch[1]}${Number(versionMatch[2]) + 1}`
        : `${x.version}.2`;

      // Calculation phase: resolve X first and retain its exact identity/evidence.
      const output = {
        total: 10,
        ruleVersion: {
          id: x.rule_x_id,
          code: x.code,
          version: x.version,
          effectiveFrom: x.effective_from,
          effectiveTo: x.effective_to,
          parameters: x.parameters,
        },
      };

      // Publication phase runs after resolution, before the historical audit is persisted.
      await publisher.query("BEGIN");
      await publisher.query(
        `UPDATE tax_rules SET effective_to=$1 WHERE id=$2`,
        [new Date(yEffectiveFrom.getTime() - 24 * 60 * 60 * 1000), x.rule_x_id],
      );
      await publisher.query(
        `INSERT INTO tax_rules
          (id, code, version, active, effective_from, effective_to,
           tax_year, name, source_url, source_reference, parameters)
         VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10)`,
        [
          yId, x.code, nextVersion, true,
          yEffectiveFrom, null, x.tax_year,
          "Rule race integration test",
          "https://example.invalid/rule-race-test",
          "test-only", JSON.stringify(x.parameters),
        ],
      );
      await publisher.query("COMMIT");

      // Persistence phase must use X, not re-resolve the now-current Y rule.
      await resolver.query("BEGIN");
      await resolver.query(
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

      const audit = await resolver.query(
        `SELECT rule_version_id, output
         FROM tax_calculation_audits
         WHERE id=$1`,
        [auditId],
      );
      const published = await resolver.query(
        `SELECT id, version, effective_from
         FROM tax_rules
         WHERE id=$1`,
        [yId],
      );

      assert.equal(audit.rows[0].rule_version_id, x.rule_x_id);
      assert.equal(audit.rows[0].output.ruleVersion.id, x.rule_x_id);
      assert.equal(audit.rows[0].output.ruleVersion.version, x.version);
      assert.deepEqual(audit.rows[0].output.ruleVersion.parameters, x.parameters);
      assert.equal(published.rows[0].id, yId);
      assert.equal(published.rows[0].version, nextVersion);

      await resolver.query("ROLLBACK");
    } finally {
      await publisher.query("ROLLBACK").catch(() => undefined);
      await resolver.query("ROLLBACK").catch(() => undefined);
      publisher.release();
      resolver.release();
      await pool.end();
    }
  },
);
