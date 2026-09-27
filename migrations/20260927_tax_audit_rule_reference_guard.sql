-- Preserve audit references to tax rules. A historical calculation must not lose
-- its rule-version identity merely because a rule row is removed.
ALTER TABLE tax_calculation_audits
  DROP CONSTRAINT IF EXISTS tax_calculation_audits_rule_version_id_fkey;

ALTER TABLE tax_calculation_audits
  ADD CONSTRAINT tax_calculation_audits_rule_version_id_fkey
  FOREIGN KEY (rule_version_id)
  REFERENCES tax_rules(id)
  ON DELETE RESTRICT;
