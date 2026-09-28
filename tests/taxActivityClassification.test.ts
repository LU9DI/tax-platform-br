import test from "node:test";
import assert from "node:assert/strict";
import { classifyFactorRActivity } from "../src/services/taxActivityClassificationService.js";

const RULE = {
  classification_method: "explicit_identifier_only" as const,
  fallback: "unknown" as const,
  identifiers: [{
    type: "CNAE" as const,
    value: "6209-1/00",
    normalized: "6209100",
    activity_label: "Administração de banco de dados",
    classification: "factor_r_subject" as const,
    legal_basis: ["LC 123/2006, art. 18, § 5º-I, XII"],
    source_reference: "Solução de Consulta COSIT nº 24/2025",
    evidence: "Atividade técnica sujeita ao Anexo III/V conforme Fator R.",
  }],
};

test("classifies an explicitly evidenced CNAE as Fator R subject", () => {
  const result = classifyFactorRActivity({ type: "CNAE", value: "6209-1/00" }, RULE);
  assert.equal(result.status, "factor_r_subject");
  assert.equal(result.activityLabel, "Administração de banco de dados");
  assert.deepEqual(result.legalBasis, ["LC 123/2006, art. 18, § 5º-I, XII"]);
});

test("normalizes CNAE formatting without using description inference", () => {
  const result = classifyFactorRActivity({ type: "CNAE", value: "6209100" }, RULE);
  assert.equal(result.status, "factor_r_subject");
});

test("unknown activity never defaults to Fator R", () => {
  const result = classifyFactorRActivity({ type: "CNAE", value: "9999-9/99" }, RULE);
  assert.equal(result.status, "unknown");
  assert.equal(result.legalBasis.length, 0);
});

test("rejects an empty activity identifier", () => {
  assert.throws(
    () => classifyFactorRActivity({ type: "CNAE", value: "" }, RULE),
    /activity identifier value is required/,
  );
});
