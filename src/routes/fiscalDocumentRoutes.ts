import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_AMOUNT = 1_000_000_000;

function userId(req: any) { return String(req.userId); }
function validAmount(value: unknown, max = MAX_AMOUNT) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
async function ownedCompany(companyId: string, uid: string) {
  const r = await initDb().query("SELECT id FROM tax_companies WHERE id=$1 AND user_id=$2", [companyId, uid]);
  return !!r.rowCount;
}
async function audit(uid: string, action: string, entityId: string | null, metadata: Record<string, unknown>) {
  await initDb().query(
    "INSERT INTO audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), uid, action, "tax_fiscal_document", entityId, JSON.stringify(metadata)]
  );
}

router.post("/:companyId", requireAuth, async (req, res) => {
  try {
    const companyId = String(req.params.companyId), uid = userId(req), b = req.body ?? {};
    if (!UUID.test(companyId)) return res.status(400).json({ error: "invalid company id" });
    if (!(await ownedCompany(companyId, uid))) return res.status(404).json({ error: "company not found" });

    const documentType = typeof b.documentType === "string" && b.documentType.trim() ? b.documentType.trim() : null;
    const issuedAt = typeof b.issuedAt === "string" ? b.issuedAt : null;
    const totalAmount = validAmount(b.totalAmount);
    const revenueAmount = validAmount(b.revenueAmount ?? b.totalAmount);
    const regularIbsCbsAmount = validAmount(b.regularIbsCbsAmount ?? 0);
    if (!documentType || !issuedAt || Number.isNaN(Date.parse(issuedAt))) return res.status(400).json({ error: "invalid document type or issuedAt" });
    if (totalAmount === null || revenueAmount === null || revenueAmount > totalAmount) return res.status(400).json({ error: "invalid document amounts" });
    if (regularIbsCbsAmount === null || regularIbsCbsAmount > revenueAmount) return res.status(400).json({ error: "invalid regularIbsCbsAmount" });

    const status = b.status ?? "active";
    const classificationStatus = b.classificationStatus ?? "pending";
    if (!["active", "cancelled"].includes(status)) return res.status(400).json({ error: "invalid status" });
    if (!["pending", "classified", "rejected"].includes(classificationStatus)) return res.status(400).json({ error: "invalid classificationStatus" });

    const ruleId = b.classificationRuleVersionId ?? null;
    if (classificationStatus === "classified" && (typeof ruleId !== "string" || !UUID.test(ruleId))) {
      return res.status(400).json({ error: "classified document requires classificationRuleVersionId" });
    }
    if (ruleId) {
      const rr = await initDb().query("SELECT id FROM tax_rules WHERE id=$1", [ruleId]);
      if (!rr.rowCount) return res.status(400).json({ error: "classification rule version not found" });
    }

    const id = randomUUID();
    const r = await initDb().query(`INSERT INTO tax_fiscal_documents
      (id,company_id,document_type,access_key,document_number,series,issued_at,total_amount,revenue_amount,regular_ibs_cbs_amount,status,classification_status,classification_code,classification_basis,classification_rule_version_id,source,external_id,raw_data)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING id,company_id,document_type,access_key,document_number,series,issued_at,total_amount,revenue_amount,regular_ibs_cbs_amount,status,classification_status,classification_code,classification_basis,classification_rule_version_id,source,external_id,created_at,updated_at`,
      [id, companyId, documentType, b.accessKey ?? null, b.documentNumber ?? null, b.series ?? null, issuedAt, totalAmount, revenueAmount, regularIbsCbsAmount, status, classificationStatus, b.classificationCode ?? null, b.classificationBasis ?? null, ruleId, b.source ?? "fiscal_document", b.externalId ?? null, JSON.stringify(b.rawData ?? {})]);
    await audit(uid, "tax_fiscal_document.created", id, { companyId, classificationStatus, classificationRuleVersionId: ruleId });
    return res.status(201).json({ ok: true, document: r.rows[0] });
  } catch (e) {
    if (String(e).includes("duplicate key")) return res.status(409).json({ error: "fiscal document already exists" });
    return res.status(400).json({ error: "failed to save fiscal document" });
  }
});

router.post("/:companyId/:documentId/cancel", requireAuth, async (req, res) => {
  try {
    const companyId = String(req.params.companyId), documentId = String(req.params.documentId), uid = userId(req);
    if (!UUID.test(companyId) || !UUID.test(documentId)) return res.status(400).json({ error: "invalid id" });
    if (!(await ownedCompany(companyId, uid))) return res.status(404).json({ error: "company not found" });
    const r = await initDb().query(
      "UPDATE tax_fiscal_documents SET status='cancelled' WHERE id=$1 AND company_id=$2 AND status='active' RETURNING id,status",
      [documentId, companyId]
    );
    if (!r.rowCount) return res.status(404).json({ error: "active fiscal document not found" });
    await audit(uid, "tax_fiscal_document.cancelled", documentId, { companyId });
    return res.json({ ok: true, document: r.rows[0] });
  } catch {
    return res.status(400).json({ error: "failed to cancel fiscal document" });
  }
});

router.post("/:companyId/:documentId/rectify", requireAuth, async (req, res) => {
  const pool = initDb();
  let client: any;
  try {
    const companyId = String(req.params.companyId), documentId = String(req.params.documentId), uid = userId(req);
    if (!UUID.test(companyId) || !UUID.test(documentId)) return res.status(400).json({ error: "invalid id" });
    if (!(await ownedCompany(companyId, uid))) return res.status(404).json({ error: "company not found" });

    const old = await pool.query("SELECT * FROM tax_fiscal_documents WHERE id=$1 AND company_id=$2 AND status='active'", [documentId, companyId]);
    if (!old.rowCount) return res.status(404).json({ error: "active fiscal document not found" });

    const b = req.body ?? {}, source = old.rows[0];
    const totalAmount = validAmount(b.totalAmount ?? source.total_amount);
    const revenueAmount = validAmount(b.revenueAmount ?? source.revenue_amount);
    const regular = validAmount(b.regularIbsCbsAmount ?? source.regular_ibs_cbs_amount);
    if (totalAmount === null || revenueAmount === null || regular === null || revenueAmount > totalAmount || regular > revenueAmount) return res.status(400).json({ error: "invalid rectified amounts" });

    const classificationStatus = b.classificationStatus ?? "pending";
    const ruleId = b.classificationRuleVersionId ?? null;
    if (!["pending", "classified", "rejected"].includes(classificationStatus)) return res.status(400).json({ error: "invalid classificationStatus" });
    if (classificationStatus === "classified" && (typeof ruleId !== "string" || !UUID.test(ruleId))) return res.status(400).json({ error: "classified rectification requires classificationRuleVersionId" });
    if (ruleId) {
      const rr = await pool.query("SELECT id FROM tax_rules WHERE id=$1", [ruleId]);
      if (!rr.rowCount) return res.status(400).json({ error: "classification rule version not found" });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    const replacementId = randomUUID();
    await client.query(`INSERT INTO tax_fiscal_documents
      (id,company_id,document_type,access_key,document_number,series,issued_at,total_amount,revenue_amount,regular_ibs_cbs_amount,status,classification_status,classification_code,classification_basis,classification_rule_version_id,source,external_id,raw_data,supersedes_document_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12,$13,$14,$15,$16,$17,$18)`,
      [replacementId, companyId, source.document_type, b.accessKey ?? source.access_key, b.documentNumber ?? source.document_number, b.series ?? source.series, b.issuedAt ?? source.issued_at, totalAmount, revenueAmount, regular, classificationStatus, b.classificationCode ?? null, b.classificationBasis ?? null, ruleId, b.source ?? source.source, b.externalId ?? null, JSON.stringify(b.rawData ?? source.raw_data), documentId]);
    await client.query("UPDATE tax_fiscal_documents SET status='rectified',rectified_by_document_id=$1 WHERE id=$2", [replacementId, documentId]);
    await client.query("COMMIT");
    client.release();
    client = undefined;
    await audit(uid, "tax_fiscal_document.rectified", replacementId, { companyId, supersedesDocumentId: documentId });
    return res.status(201).json({ ok: true, replacementDocumentId: replacementId, supersedesDocumentId: documentId });
  } catch (e) {
    if (client) { try { await client.query("ROLLBACK"); } finally { client.release(); } }
    if (String(e).includes("duplicate key")) return res.status(409).json({ error: "rectified fiscal document already exists" });
    return res.status(400).json({ error: "failed to rectify fiscal document" });
  }
});

router.post("/:companyId/:documentId/classify", requireAuth, async (req, res) => {
  try {
    const companyId = String(req.params.companyId), documentId = String(req.params.documentId), uid = userId(req);
    if (!UUID.test(companyId) || !UUID.test(documentId)) return res.status(400).json({ error: "invalid id" });
    if (!(await ownedCompany(companyId, uid))) return res.status(404).json({ error: "company not found" });

    const code = typeof req.body?.classificationCode === "string" ? req.body.classificationCode.trim() : "";
    const basis = typeof req.body?.classificationBasis === "string" ? req.body.classificationBasis.trim() : "";
    const ruleId = typeof req.body?.classificationRuleVersionId === "string" ? req.body.classificationRuleVersionId : "";
    if (!code || !basis || !UUID.test(ruleId)) return res.status(400).json({ error: "classification code, basis and rule version are required" });

    const rule = await initDb().query("SELECT id FROM tax_rules WHERE id=$1", [ruleId]);
    if (!rule.rowCount) return res.status(400).json({ error: "classification rule version not found" });

    const r = await initDb().query(
      `UPDATE tax_fiscal_documents
       SET classification_status='classified',classification_code=$1,classification_basis=$2,classification_rule_version_id=$3
       WHERE id=$4 AND company_id=$5 AND status='active' AND classification_status IN ('pending','rejected')
       RETURNING id,classification_status,classification_code,classification_basis,classification_rule_version_id`,
      [code, basis, ruleId, documentId, companyId]
    );
    if (!r.rowCount) return res.status(404).json({ error: "classifiable fiscal document not found" });
    await audit(uid, "tax_fiscal_document.classified", documentId, { companyId, classificationCode: code, classificationRuleVersionId: ruleId });
    return res.json({ ok: true, document: r.rows[0] });
  } catch {
    return res.status(400).json({ error: "failed to classify fiscal document" });
  }
});

router.get("/:companyId", requireAuth, async (req, res) => {
  try {
    const companyId = String(req.params.companyId);
    if (!UUID.test(companyId)) return res.status(400).json({ error: "invalid company id" });
    if (!(await ownedCompany(companyId, userId(req)))) return res.status(404).json({ error: "company not found" });
    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const r = await initDb().query(`SELECT id,document_type,access_key,document_number,series,issued_at,total_amount,revenue_amount,regular_ibs_cbs_amount,status,classification_status,classification_code,classification_basis,classification_rule_version_id,source,external_id,supersedes_document_id,rectified_by_document_id,created_at,updated_at
      FROM tax_fiscal_documents WHERE company_id=$1 ORDER BY issued_at DESC LIMIT $2`, [companyId, limit]);
    return res.json({ documents: r.rows });
  } catch {
    return res.status(500).json({ error: "failed to load fiscal documents" });
  }
});

router.post("/:companyId/reconcile-revenue", requireAuth, async (req, res) => {
  try {
    const companyId = String(req.params.companyId), uid = userId(req), period = typeof req.body?.period === "string" ? req.body.period : "";
    if (!UUID.test(companyId) || !MONTH.test(period)) return res.status(400).json({ error: "invalid company id or period" });
    if (!(await ownedCompany(companyId, uid))) return res.status(404).json({ error: "company not found" });

    const r = await initDb().query(`SELECT COALESCE(SUM(revenue_amount),0)::numeric gross_revenue,
      COALESCE(SUM(regular_ibs_cbs_amount),0)::numeric regular_ibs_cbs,COUNT(*)::int document_count
      FROM tax_fiscal_documents
      WHERE company_id=$1 AND status='active' AND classification_status='classified'
        AND to_char(issued_at AT TIME ZONE 'UTC','YYYY-MM')=$2`, [companyId, period]);
    const row = r.rows[0];
    const db = initDb();
    const idResult = await db.query("SELECT id FROM tax_revenues WHERE company_id=$1 AND reference_month=$2", [companyId, period + "-01"]);
    const id = idResult.rows[0]?.id ?? randomUUID();
    await db.query(`INSERT INTO tax_revenues(id,company_id,reference_month,amount,regular_ibs_cbs_amount,source,notes,revenue_basis,fiscal_document_count)
      VALUES($1,$2,$3,$4,$5,'fiscal_documents',$6,'fiscal_documents',$7)
      ON CONFLICT(company_id,reference_month) DO UPDATE SET
        amount=EXCLUDED.amount,regular_ibs_cbs_amount=EXCLUDED.regular_ibs_cbs_amount,source='fiscal_documents',
        notes=EXCLUDED.notes,revenue_basis='fiscal_documents',fiscal_document_count=EXCLUDED.fiscal_document_count`,
      [id, companyId, period + "-01", row.gross_revenue, row.regular_ibs_cbs, `Reconciled from ${row.document_count} classified active fiscal documents`, row.document_count]);
    await audit(uid, "tax_revenue.reconciled_from_fiscal_documents", null, { companyId, period, fiscalDocumentCount: Number(row.document_count) });
    return res.json({ ok: true, period, grossRevenue: Number(row.gross_revenue), regularIbsCbsAmount: Number(row.regular_ibs_cbs), fiscalDocumentCount: Number(row.document_count), revenueBasis: "fiscal_documents" });
  } catch {
    return res.status(400).json({ error: "failed to reconcile fiscal documents" });
  }
});

export default router;
