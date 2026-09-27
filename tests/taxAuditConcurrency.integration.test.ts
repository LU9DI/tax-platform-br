import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.TAX_TEST_DATABASE_URL;

test("tax calculation idempotency is race-safe at the database constraint", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const seed = await pool.query(`
    SELECT c.id AS company_id, r.id AS rule_version_id
    FROM tax_companies c
    CROSS JOIN tax_rules r
    WHERE r.active=true
    ORDER BY r.effective_from DESC, r.version DESC
    LIMIT 1
  `);
  if (!seed.rowCount) {
    await pool.end();
    return;
  }

  const companyId = seed.rows[0].company_id;
  const ruleVersionId = seed.rows[0].rule_version_id;
  const key = `concurrency-test-${randomUUID()}`;
  const id1 = randomUUID();
  const id2 = randomUUID();

  const sql = `
    INSERT INTO tax_calculation_audits
      (id, company_id, calculation_type, input, output, rule_version_id, idempotency_key, request_fingerprint)
    VALUES ($1,$2,'concurrency_test','{"base":1000}','{"total":10}',$3,$4,'same-fingerprint')
    ON CONFLICT (company_id, calculation_type, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    DO NOTHING
    RETURNING id
  `;

  const results = await Promise.all([
    pool.query(sql, [id1, companyId, ruleVersionId, key]),
    pool.query(sql, [id2, companyId, ruleVersionId, key]),
  ]);

  const inserted = results.filter((r) => r.rowCount === 1);
  assert.equal(inserted.length, 1);

  const persisted = await pool.query(
    `SELECT count(*)::int AS count
     FROM tax_calculation_audits
     WHERE company_id=$1 AND calculation_type='concurrency_test' AND idempotency_key=$2`,
    [companyId, key],
  );
  assert.equal(Number(persisted.rows[0].count), 1);

  await pool.query(
    `DELETE FROM tax_calculation_audits
     WHERE company_id=$1 AND calculation_type='concurrency_test' AND idempotency_key=$2`,
    [companyId, key],
  );
  await pool.end();
});
