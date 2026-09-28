import { createHash, randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";

export type TaxRuleEvidenceReference = { id: string; role: string };

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

function findRuleSnapshot(output: unknown, role: string) {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (role === "primary") return ruleSnapshotFromOutput(output);
  if (role === "activity_classification") {
    const classification = record.activityClassification;
    if (!classification || typeof classification !== "object") return null;
    const snapshot = (classification as Record<string, unknown>).ruleVersion;
    return snapshot && typeof snapshot === "object" ? snapshot as Record<string, unknown> : null;
  }
  const key = role === "annex" ? "annexRuleVersion" : "revenueRecognition";
  const value = record[key];
  if (role === "annex") return value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!value || typeof value !== "object") return null;
  const snapshot = (value as Record<string, unknown>).ruleVersion;
  return snapshot && typeof snapshot === "object" ? snapshot as Record<string, unknown> : null;
}

export function ruleEvidenceMatches(
  output: unknown,
  rule: { id: string; rule_code: string; version: string; parameters: unknown },
) {
  const snapshot = ruleSnapshotFromOutput(output);
  if (!snapshot) return false;

  const expectedSnapshot = {
    id: rule.id,
    code: rule.rule_code,
    version: rule.version,
    parameters: rule.parameters,
  };
  const actualSnapshot = {
    id: snapshot.id,
    code: snapshot.code,
    version: snapshot.version,
    parameters: snapshot.parameters,
  };

  return stableJson(actualSnapshot) === stableJson(expectedSnapshot);
}

function ruleEvidenceMatchesSnapshot(
  snapshot: Record<string, unknown> | null,
  rule: { id: string; rule_code: string; version: string; parameters: unknown },
) {
  if (!snapshot) return false;
  return stableJson({
    id: snapshot.id,
    code: snapshot.code,
    version: snapshot.version,
    parameters: snapshot.parameters,
  }) === stableJson({
    id: rule.id,
    code: rule.rule_code,
    version: rule.version,
    parameters: rule.parameters,
  });
}

async function collectRuleEvidence(
  db: ReturnType<typeof initDb>,
  output: unknown,
  primaryRuleId: string,
): Promise<TaxRuleEvidenceReference[]> {
  const orderedRoles = ["primary", "activity_classification", "annex", "revenue_recognition"];
  const references: TaxRuleEvidenceReference[] = [];

  for (const role of orderedRoles) {
    const snapshot = findRuleSnapshot(output, role);
    if (!snapshot) {
      if (role === "primary") {
        throw new Error("calculation evidence does not include the primary tax rule snapshot");
      }
      continue;
    }

    if (role === "primary" && snapshot.id !== primaryRuleId) {
      throw new Error("calculation evidence primary rule does not match ruleVersionId");
    }

    const id = typeof snapshot.id === "string" ? snapshot.id : null;
    if (!id) {
      const error = new Error(`calculation evidence is incomplete for role: ${role}`);
      (error as Error & { code?: string }).code = "RULE_EVIDENCE_MISMATCH";
      throw error;
    }

    const rule = await db.query(
      `SELECT id, code AS rule_code, version, parameters
       FROM tax_rules
       WHERE id=$1`,
      [id],
    );
    if (!rule.rowCount || !ruleEvidenceMatchesSnapshot(snapshot, rule.rows[0])) {
      const error = new Error(`calculation evidence does not match the referenced tax rule version for role: ${role}`);
      (error as Error & { code?: string }).code = "RULE_EVIDENCE_MISMATCH";
      throw error;
    }

    references.push({ id, role });
  }

  return references;
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
  const pool = initDb();
  const own = await pool.query(
    "SELECT id FROM tax_companies WHERE id=$1 AND user_id=$2",
    [companyId, userId],
  );
  if (!own.rowCount) return null;

  const db = await pool.connect();
  try {
    await db.query("BEGIN");

    const references = await collectRuleEvidence(db, output, ruleVersionId);
    const fingerprint = createHash("sha256")
      .update(stableJson({
        type,
        input,
        output,
        ruleVersions: references,
      }))
      .digest("hex");

    const auditId = randomUUID();
    const r = await db.query(
      `INSERT INTO tax_calculation_audits
         (id,company_id,calculation_type,input,output,rule_version_id,idempotency_key,request_fingerprint)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (company_id, calculation_type, idempotency_key)
       WHERE idempotency_key IS NOT NULL
       DO NOTHING
       RETURNING *`,
      [auditId, companyId, type, JSON.stringify(input), JSON.stringify(output), ruleVersionId, idempotencyKey ?? null, fingerprint],
    );

    if (r.rowCount) {
      for (const reference of references) {
        await db.query(
          `INSERT INTO tax_calculation_audit_rule_versions
             (audit_id, rule_version_id, role)
           VALUES ($1,$2,$3)`,
          [auditId, reference.id, reference.role],
        );
      }
      await db.query("COMMIT");
      return r.rows[0];
    }

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
        await db.query("COMMIT");
        return existing.rows[0];
      }
    }

    throw new Error("failed to persist tax calculation audit");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
