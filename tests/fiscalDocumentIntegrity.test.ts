import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.TAX_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

test("fiscal rectification removes the original document from the active RBT12 source", { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  const originalId = randomUUID();
  const replacementId = randomUUID();
  const cancelledId = randomUUID();
  const companyId = "00000000-0000-4000-8000-000000000002";

  try {
    const rule = await pool.query<{ id: string }>("SELECT id FROM tax_rules ORDER BY id LIMIT 1");
    const classification = rule.rowCount
      ? { status: "classified", ruleId: rule.rows[0].id }
      : { status: "pending", ruleId: null };

    await pool.query(
      `INSERT INTO tax_fiscal_documents
        (id, company_id, document_type, access_key, document_number, issued_at,
         total_amount, revenue_amount, regular_ibs_cbs_amount, status,
         classification_status, classification_rule_version_id, source, external_id)
       VALUES
        ($1,$2,'nfe',$3,'CI-ORIGINAL','2027-01-15T12:00:00Z',
         10000,10000,1000,'active',$4,$5,'ci_test',$6)`,
      [originalId, companyId, `CI-${originalId}`, classification.status, classification.ruleId, `CI-${originalId}`]
    );

    const before = await pool.query(
      `SELECT COALESCE(SUM(revenue_amount - regular_ibs_cbs_amount),0)::numeric AS revenue,
              COUNT(*)::int AS documents
         FROM tax_fiscal_documents
        WHERE company_id=$1 AND status='active' AND issued_at >= '2027-01-01' AND issued_at < '2027-02-01'`,
      [companyId]
    );
    assert.equal(Number(before.rows[0].revenue), 9000);
    assert.equal(Number(before.rows[0].documents), 1);

    await pool.query(
      `INSERT INTO tax_fiscal_documents
        (id, company_id, document_type, access_key, document_number, issued_at,
         total_amount, revenue_amount, regular_ibs_cbs_amount, status,
         classification_status, classification_rule_version_id, source, external_id,
         supersedes_document_id)
       VALUES
        ($1,$2,'nfe',$3,'CI-REPLACEMENT','2027-01-16T12:00:00Z',
         12000,12000,1200,'active',$4,$5,'ci_test',$6,$7)`,
      [replacementId, companyId, `CI-${replacementId}`, classification.status, classification.ruleId, `CI-${replacementId}`, originalId]
    );

    const replaced = await pool.query(
      "SELECT status, rectified_by_document_id FROM tax_fiscal_documents WHERE id=$1",
      [originalId]
    );
    assert.equal(replaced.rows[0].status, "rectified");
    assert.equal(replaced.rows[0].rectified_by_document_id, replacementId);

    const after = await pool.query(
      `SELECT COALESCE(SUM(revenue_amount - regular_ibs_cbs_amount),0)::numeric AS revenue,
              COUNT(*)::int AS documents
         FROM tax_fiscal_documents
        WHERE company_id=$1 AND status='active' AND issued_at >= '2027-01-01' AND issued_at < '2027-02-01'`,
      [companyId]
    );
    assert.equal(Number(after.rows[0].revenue), 10800);
    assert.equal(Number(after.rows[0].documents), 1);

    await assert.rejects(
      pool.query(
        `INSERT INTO tax_fiscal_documents
          (id, company_id, document_type, access_key, issued_at,
           total_amount, revenue_amount, regular_ibs_cbs_amount, status,
           classification_status, classification_rule_version_id, source, external_id,
           supersedes_document_id)
         VALUES
          ($1,$2,'nfe',$3,'2027-01-17T12:00:00Z',
           13000,13000,1300,'active',$4,$5,'ci_test',$6,$7)`,
        [randomUUID(), companyId, `CI-DUP-${originalId}`, classification.status, classification.ruleId, `CI-DUP-${originalId}`, originalId]
      ),
      /duplicate key|unique constraint|already exists/i
    );

    await assert.rejects(
      pool.query(
        "UPDATE tax_fiscal_documents SET supersedes_document_id=NULL WHERE id=$1",
        [replacementId]
      ),
      /immutable/i
    );

    await pool.query(
      `INSERT INTO tax_fiscal_documents
        (id, company_id, document_type, access_key, issued_at,
         total_amount, revenue_amount, regular_ibs_cbs_amount, status,
         classification_status, classification_rule_version_id, source, external_id)
       VALUES
        ($1,$2,'nfe',$3,'2027-01-20T12:00:00Z',
         5000,5000,500,'active',$4,$5,'ci_test',$6)`,
      [cancelledId, companyId, `CI-${cancelledId}`, classification.status, classification.ruleId, `CI-${cancelledId}`]
    );
    await pool.query("UPDATE tax_fiscal_documents SET status='cancelled' WHERE id=$1", [cancelledId]);

    const finalActive = await pool.query(
      `SELECT COUNT(*)::int AS documents
         FROM tax_fiscal_documents
        WHERE company_id=$1 AND status='active' AND issued_at >= '2027-01-01' AND issued_at < '2027-02-01'`,
      [companyId]
    );
    assert.equal(finalActive.rows[0].documents, 1);
  } finally {
    await pool.query("UPDATE tax_fiscal_documents SET rectified_by_document_id=NULL WHERE id=$1", [originalId]).catch(() => {});
    await pool.query("DELETE FROM tax_fiscal_documents WHERE id IN ($1,$2,$3)", [replacementId, cancelledId, originalId]).catch(() => {});
    await pool.end();
  }
});
