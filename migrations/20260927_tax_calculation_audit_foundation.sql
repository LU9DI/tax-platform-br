-- Restore the audit table required by tax calculation persistence and reporting.
-- The application treats audit rows as append-only calculation evidence.
CREATE TABLE IF NOT EXISTS tax_calculation_audits (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES tax_companies(id) ON DELETE CASCADE,
  calculation_type TEXT NOT NULL,
  input JSONB NOT NULL,
  output JSONB NOT NULL,
  rule_version_id UUID REFERENCES tax_rules(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_calculation_audits_company_created
  ON tax_calculation_audits(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tax_calculation_audits_rule_version
  ON tax_calculation_audits(rule_version_id);
