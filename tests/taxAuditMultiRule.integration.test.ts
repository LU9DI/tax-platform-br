import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { recordTaxCalculation } from "../src/services/taxAuditService.js";

const databaseUrl = process.env.TAX_TEST_DATABASE_URL;

test(
  "multi-rule audit binds every normative rule and fingerprints the full rule set",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const seed = await pool.query(`
        SELECT c.id AS company_id, c.user_id
        FROM tax_companies c
        LIMIT 1
      `);
      assert.equal(seed.rowCount, 1);
      const company = seed.rows[0];

      const rules = await pool.query(`
        SELECT id, code, version, parameters
        FROM tax_rules
        WHERE code IN (
          'SIMPLES_NACIONAL_FATOR_R_2027',
          'SIMPLES_NACIONAL_FATOR_R_ACTIVITY_CLASSIFICATION_2027',
          'SIMPLES_NACIONAL_ANEXO_III_2027',
          'SIMPLES_NACIONAL_ANEXO_V_2027',
          'SIMPLES_NACIONAL_REVENUE_RECOGNITION_2027'
        )
      `);
      const byCode = new Map(rules.rows.map((row) => [row.code, row]));
      for (const code of [
        "SIMPLES_NACIONAL_FATOR_R_2027",
        "SIMPLES_NACIONAL_FATOR_R_ACTIVITY_CLASSIFICATION_2027",
        "SIMPLES_NACIONAL_ANEXO_III_2027",
        "SIMPLES_NACIONAL_ANEXO_V_2027",
        "SIMPLES_NACIONAL_REVENUE_RECOGNITION_2027",
      ]) assert.ok(byCode.has(code), `missing rule ${code}`);

      const factor = byCode.get("SIMPLES_NACIONAL_FATOR_R_2027");
      const classification = byCode.get("SIMPLES_NACIONAL_FATOR_R_ACTIVITY_CLASSIFICATION_2027");
      const annexIII = byCode.get("SIMPLES_NACIONAL_ANEXO_III_2027");
      const annexV = byCode.get("SIMPLES_NACIONAL_ANEXO_V_2027");
      const revenue = byCode.get("SIMPLES_NACIONAL_REVENUE_RECOGNITION_2027");

      const snapshot = (r: any) => ({
        id: r.id,
        code: r.code,
        version: r.version,
        parameters: r.parameters,
      });

      const input = { year: 2027, month: 1, revenue12m: 100000, monthlyRevenue: 10000 };
      const output = {
        total: 123,
        ruleVersion: snapshot(factor),
        activityClassification: {
          status: "factor_r_subject",
          ruleVersion: snapshot(classification),
        },
        annexRuleVersion: snapshot(annexIII),
        revenueRecognition: {
          monthlyRevenue: 10000,
          ruleVersion: snapshot(revenue),
        },
      };
      const key = `multi-rule-${randomUUID()}`;

      const audit = await recordTaxCalculation(
        company.company_id,
        company.user_id,
        "multi_rule_test",
        input,
        output,
        factor.id,
        key,
      );
      assert.ok(audit);

      const refs = await pool.query(
        `SELECT role, rule_version_id
         FROM tax_calculation_audit_rule_versions
         WHERE audit_id=$1
         ORDER BY role`,
        [audit.id],
      );
      assert.deepEqual(
        refs.rows.map((row) => row.role),
        ["activity_classification", "annex", "primary", "revenue_recognition"],
      );
      assert.equal(refs.rowCount, 4);
      assert.equal(
        new Set(refs.rows.map((row) => row.rule_version_id)).size,
        4,
      );

      const alteredOutput = {
        ...output,
        annexRuleVersion: snapshot(annexV),
      };

      await assert.rejects(
        recordTaxCalculation(
          company.company_id,
          company.user_id,
          "multi_rule_test",
          input,
          alteredOutput,
          factor.id,
          key,
        ),
        (error: unknown) =>
          Boolean(error) &&
          typeof error === "object" &&
          (error as { code?: string }).code === "IDEMPOTENCY_CONFLICT",
      );
    } finally {
      await pool.end();
    }
  },
);
