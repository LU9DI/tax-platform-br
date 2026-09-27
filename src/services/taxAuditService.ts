import { createHash, randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";

export async function getEffectiveTaxRule(ruleCode: string, at = new Date()) {
  const r = await initDb().query(
    `SELECT id, code AS rule_code, version, effective_from, effective_to, tax_year, name, source_url, source_reference, parameters
     FROM tax_rules
     WHERE code=$1
       AND active=true
       AND effective_from <= ($2::timestamptz)::date
       AND (effective_to IS NULL OR effective_to >= ($2::timestamptz)::date)
     ORDER BY effective_from DESC, version DESC
     LIMIT 1`,
    [ruleCode, at.toISOString()],
  );
  return r.rows[0] ?? null;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function ruleSnapshotFromOutput(output: unknown) {
  if (!output || typeof output !== "object") return null;
  const snapshot = (output as Record<string, unknown>).ruleVersion;
  return snapshot && typeof snapshot === "object" ? snapshot as Record<string, unknown> : null;
}

export async function recordTaxCalculation(
  companyId: string,
  userId: string,
  type: string,
  input: unknown,
  output: unknown,
  ruleVersionId: string,
  idempotencyKey?: string,
) {
  const db = initDb();
  const own = await db.query(
    "SELECT id FROM tax_companies WHERE id=$1 AND user_id=$2",
    [companyId, userId],
  );
  if (!own.rowCount) return null;

  // Re-read only the referenced rule row. We never resolve "the current rule"
  // here: the caller's exact ruleVersionId is the identity of the calculation.
  // This check prevents a calculation produced with rule A from being persisted
  // under rule B or with parameters that differ from the referenced version.
  const rule = await db.query(
    `SELECT id, code AS rule_code, version, effective_from, effective_to,
            source_url, source_reference, parameters
     FROM tax_rules
     WHERE id=$1`,
    [ruleVersionId],
  );
  if (!rule.rowCount) throw new Error("tax rule version no longer exists");

  const snapshot = ruleSnapshotFromOutput(output);
  const persistedSnapshot = {
    id: rule.rows[0].id,
    code: rule.rows[0].rule_code,
    version: rule.rows[0].version,
    effectiveFrom: rule.rows[0].effective_from,
    effectiveTo: rule.rows[0].effective_to,
    sourceUrl: rule.rows[0].source_url,
    sourceReference: rule.rows[0].source_reference,
    parameters: rule.rows[0].parameters,
  };

  if (!snapshot || stableJson(snapshot) !== stableJson(persistedSnapshot)) {
    const error = new Error("calculation evidence does not match the referenced tax rule version");
    (error as Error & { code?: string }).code = "RULE_EVIDENCE_MISMATCH";
    throw error;
  }

  const fingerprint = createHash("sha256")
    .update(stableJson({ type, input, ruleVersionId }))
    .digest("hex");

  const r = await db.query(
    `INSERT INTO tax_calculation_audits
       (id,company_id,calculation_type,input,output,rule_version_id,idempotency_key,request_fingerprint)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (company_id, calculation_type, idempotency_key)
     WHERE idempotency_key IS NOT NULL
     DO NOTHING
     RETURNING *`,
    [randomUUID(), companyId, type, JSON.stringify(input), JSON.stringify(output), ruleVersionId, idempotencyKey ?? null, fingerprint],
  );

  if (r.rowCount) return r.rows[0];

  if (idempotencyKey) {
    const existing = await db.query(
      "SELECT * FROM tax_calculation_audits WHERE company_id=$1 AND calculation_type=$2 AND idempotency_key=$3 LIMIT 1",
      [companyId, type, idempotencyKey],
    );
    if (existing.rowCount) {
      if (existing.rows[0].request_fingerprint !== fingerprint) {
        const error = new Error("idempotency-key was already used with a different calculation payload");
        (error as Error & { code?: string }).code = "IDEMPOTENCY_CONFLICT";
        throw error;
      }
      return existing.rows[0];
    }
  }

  throw new Error("failed to persist tax calculation audit");
}
