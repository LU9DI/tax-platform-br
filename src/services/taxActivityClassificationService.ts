export type TaxActivityIdentifier = {
  type: "CNAE";
  value: string;
};

export type FactorRActivityClassification = {
  status: "factor_r_subject" | "not_factor_r_subject" | "unknown";
  identifier: TaxActivityIdentifier;
  activityLabel?: string;
  legalBasis: string[];
  sourceReference?: string;
  evidence?: string;
};

type ClassificationRule = {
  classification_method: "explicit_identifier_only";
  fallback: "unknown";
  identifiers: Array<{
    type: "CNAE";
    value: string;
    normalized: string;
    activity_label: string;
    classification: "factor_r_subject" | "not_factor_r_subject";
    legal_basis: string[];
    source_reference: string;
    evidence: string;
  }>;
};

function normalizeCnae(value: unknown): string {
  return String(value ?? "").replace(/\\D/g, "");
}

export function classifyFactorRActivity(
  identifier: TaxActivityIdentifier,
  rule: ClassificationRule,
): FactorRActivityClassification {
  if (!identifier || identifier.type !== "CNAE") {
    throw new Error("activity identifier type must be CNAE");
  }

  const normalized = normalizeCnae(identifier.value);
  if (!normalized) throw new Error("activity identifier value is required");

  if (rule?.classification_method !== "explicit_identifier_only" || rule?.fallback !== "unknown") {
    throw new Error("invalid activity classification rule");
  }

  const match = rule.identifiers.find(
    (item) => item.type === identifier.type && item.normalized === normalized,
  );

  if (!match) {
    return {
      status: "unknown",
      identifier: { type: "CNAE", value: identifier.value },
      legalBasis: [],
    };
  }

  return {
    status: match.classification,
    identifier: { type: "CNAE", value: identifier.value },
    activityLabel: match.activity_label,
    legalBasis: match.legal_basis,
    sourceReference: match.source_reference,
    evidence: match.evidence,
  };
}
