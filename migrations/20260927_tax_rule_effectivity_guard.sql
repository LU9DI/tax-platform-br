-- Enforce non-overlapping active validity windows per tax-rule code.
-- This prevents the resolver from silently choosing one rule when two versions
-- are simultaneously effective for the same code.
CREATE OR REPLACE FUNCTION validate_tax_rule_effectivity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.effective_to IS NOT NULL AND NEW.effective_to < NEW.effective_from THEN
    RAISE EXCEPTION 'tax rule % has invalid effective period', NEW.code;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM tax_rules r
     WHERE r.code = NEW.code
       AND r.active = true
       AND r.id <> NEW.id
       AND r.effective_from <= COALESCE(NEW.effective_to, '9999-12-31'::date)
       AND COALESCE(r.effective_to, '9999-12-31'::date) >= NEW.effective_from
  ) THEN
    RAISE EXCEPTION 'tax rule % has overlapping active validity period', NEW.code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_rule_effectivity_guard ON tax_rules;
CREATE TRIGGER trg_tax_rule_effectivity_guard
BEFORE INSERT OR UPDATE OF code, active, effective_from, effective_to
ON tax_rules
FOR EACH ROW EXECUTE FUNCTION validate_tax_rule_effectivity();
