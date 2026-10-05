-- Store the monthly provenance used by Fator R as first-class immutable evidence.
CREATE TABLE IF NOT EXISTS tax_calculation_audit_monthly_evidence (
  audit_id UUID NOT NULL REFERENCES tax_calculation_audits(id) ON DELETE RESTRICT,
  period_year INTEGER NOT NULL CHECK (period_year >= 2000 AND period_year <= 2100),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  fs NUMERIC(14,2) NOT NULL CHECK (fs >= 0),
  revenue NUMERIC(14,2) NOT NULL CHECK (revenue >= 0),
  regime TEXT NOT NULL CHECK (regime IN ('mei','simples_nacional')),
  source_reference TEXT NOT NULL,
  rule_version_id UUID NOT NULL REFERENCES tax_rules(id) ON DELETE RESTRICT,
  PRIMARY KEY (audit_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_tax_calculation_audit_monthly_evidence_rule
  ON tax_calculation_audit_monthly_evidence(rule_version_id);

CREATE INDEX IF NOT EXISTS idx_tax_calculation_audit_monthly_evidence_period
  ON tax_calculation_audit_monthly_evidence(period_year, period_month);

CREATE OR REPLACE FUNCTION prevent_tax_calculation_audit_monthly_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tax_calculation_audit_monthly_evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_calculation_audit_monthly_evidence_immutable
  ON tax_calculation_audit_monthly_evidence;

CREATE TRIGGER trg_tax_calculation_audit_monthly_evidence_immutable
BEFORE UPDATE OR DELETE ON tax_calculation_audit_monthly_evidence
FOR EACH ROW EXECUTE FUNCTION prevent_tax_calculation_audit_monthly_evidence_mutation();
