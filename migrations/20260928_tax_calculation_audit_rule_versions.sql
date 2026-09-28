-- Explicit normative rule references for every tax calculation audit.
-- The primary rule remains on tax_calculation_audits.rule_version_id; this table
-- makes every additional rule used by a calculation independently addressable
-- and protected by a real foreign key.
CREATE TABLE IF NOT EXISTS tax_calculation_audit_rule_versions (
  audit_id UUID NOT NULL REFERENCES tax_calculation_audits(id) ON DELETE RESTRICT,
  rule_version_id UUID NOT NULL REFERENCES tax_rules(id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  PRIMARY KEY (audit_id, rule_version_id, role)
);

CREATE INDEX IF NOT EXISTS idx_tax_calculation_audit_rule_versions_rule
  ON tax_calculation_audit_rule_versions(rule_version_id);

CREATE INDEX IF NOT EXISTS idx_tax_calculation_audit_rule_versions_audit
  ON tax_calculation_audit_rule_versions(audit_id);

CREATE OR REPLACE FUNCTION prevent_tax_calculation_audit_rule_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tax_calculation_audit_rule_versions is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_calculation_audit_rule_versions_immutable
  ON tax_calculation_audit_rule_versions;
CREATE TRIGGER trg_tax_calculation_audit_rule_versions_immutable
BEFORE UPDATE OR DELETE ON tax_calculation_audit_rule_versions
FOR EACH ROW EXECUTE FUNCTION prevent_tax_calculation_audit_rule_version_mutation();
