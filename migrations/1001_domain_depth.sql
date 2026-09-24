CREATE TABLE IF NOT EXISTS tax_rule_versions (
 id uuid PRIMARY KEY, rule_code text NOT NULL, version integer NOT NULL,
 effective_from date NOT NULL, effective_to date, rule jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(rule_code,version)
);
CREATE TABLE IF NOT EXISTS tax_calculation_audits (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES tax_companies(id) ON DELETE CASCADE,
 calculation_type text NOT NULL, input jsonb NOT NULL, output jsonb NOT NULL,
 rule_version_id uuid REFERENCES tax_rule_versions(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tax_calc_company_created ON tax_calculation_audits(company_id,created_at DESC);