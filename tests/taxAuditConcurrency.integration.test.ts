import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.TAX_TEST_DATABASE_URL;

test("tax calculation idempotency is race-safe at the database constraint", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const seed = await pool.query(`
    SELECT c.id AS company_id,
           r.id AS rule_version_id,
           r.code,
           r.version,
           r.effective_from,
           r.effective_to,
           r.parameters
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

  const x = seed.rows[0];
  const companyId = x.company_id;
  const ruleVersionId = x.rule_version_id;
  const key = `concurrency-test-${randomUUID()}`;
  const id1 = randomUUID();
  const id2 = randomUUID();

  // The DB evidence trigger requires the persisted output to prove which exact
  // rule version and parameters produced the calculation.
  const output = JSON.stringify({
    total: 10,
    ruleVersion: {
      id: x.rule_version_id,
      code: x.code,
      version: x.version,
      effectiveFrom: x.effective_from.toISOString().slice(0, 10),
      effectiveTo: x.effective_to ? x.effective_to.toISOString().slice(0, 10) : null,
      parameters: x.parameters,
    },
  });

  const sql = `
    INSERT INTO tax_calculation_audits
      (id, company_id, calculation_type, input, output, rule_version_id, idempotency_key, request_fingerprint)
    VALUES ($1,$2,'concurrency_test','{"base":1000}',$3,$4,$5,'same-fingerprint')
    ON CONFLICT (company_id, calculation_type, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    DO NOTHING
    RETURNING id
  `;

  const client1 = await pool.connect();
  const client2 = await pool.connect();

  try {
    await client1.query("BEGIN");
    await client2.query("BEGIN");

    const first = await client1.query(sql, [id1, companyId, output, ruleVersionId, key]);
    const secondPromise = client2.query(sql, [id2, companyId, output, ruleVersionId, key]);

    // The second transaction must wait on the unique constraint until the first resolves.
    await client1.query("COMMIT");
    const second = await secondPromise;

    assert.equal(first.rowCount, 1);
    assert.equal(second.rowCount, 0);

    const persisted = await client1.query(
      `SELECT count(*)::int AS count
       FROM tax_calculation_audits
       WHERE company_id=$1 AND calculation_type='concurrency_test' AND idempotency_key=$2`,
      [companyId, key],
    );
    assert.equal(Number(persisted.rows[0].count), 1);

    await client2.query("ROLLBACK");
  } finally {
    client1.release();
    client2.release();
  }

  await pool.end();
});
