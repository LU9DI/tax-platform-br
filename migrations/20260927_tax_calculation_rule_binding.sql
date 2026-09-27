-- Guarantee that persisted evidence remains bound to the exact rule identity
-- and parameters used by the calculation, even if rule validity dates are later
-- adjusted to publish a newer version.
CREATE OR REPLACE FUNCTION validate_tax_calculation_rule_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rule_row RECORD;
BEGIN
  SELECT id, code, version, parameters
    INTO rule_row
    FROM tax_rules
   WHERE id = NEW.rule_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax rule version % does not exist', NEW.rule_version_id;
  END IF;

  IF COALESCE(NEW.output->'ruleVersion'->>'id', '') <> rule_row.id::text
     OR COALESCE(NEW.output->'ruleVersion'->>'code', '') <> rule_row.code
     OR COALESCE(NEW.output->'ruleVersion'->>'version', '') <> rule_row.version::text
     OR COALESCE(NEW.output->'ruleVersion'->'parameters', 'null'::jsonb) <> COALESCE(rule_row.parameters, 'null'::jsonb)
  THEN
    RAISE EXCEPTION 'tax calculation evidence does not match referenced rule version %', NEW.rule_version_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_calculation_rule_evidence ON tax_calculation_audits;
CREATE TRIGGER trg_tax_calculation_rule_evidence
BEFORE INSERT ON tax_calculation_audits
FOR EACH ROW EXECUTE FUNCTION validate_tax_calculation_rule_evidence();

-- Version identity and calculation parameters are immutable once a rule is
-- referenced by historical evidence. Validity dates may still be adjusted to
-- close a period when a newer rule is published.
CREATE OR REPLACE FUNCTION prevent_referenced_tax_rule_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM tax_calculation_audits
     WHERE rule_version_id = OLD.id
  ) AND (
    NEW.code IS DISTINCT FROM OLD.code
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.parameters IS DISTINCT FROM OLD.parameters
  ) THEN
    RAISE EXCEPTION 'referenced tax rule identity/parameters are immutable; publish a new version';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_rule_identity_immutable ON tax_rules;
CREATE TRIGGER trg_tax_rule_identity_immutable
BEFORE UPDATE ON tax_rules
FOR EACH ROW EXECUTE FUNCTION prevent_referenced_tax_rule_identity_mutation();
