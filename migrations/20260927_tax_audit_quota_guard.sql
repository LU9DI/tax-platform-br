-- Hard ceiling for immutable tax evidence per tenant company.
-- The advisory transaction lock makes the count check race-safe across instances.
CREATE OR REPLACE FUNCTION enforce_tax_calculation_audit_quota()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_count BIGINT;
  max_count CONSTANT BIGINT := 100000;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.company_id::text)::bigint);
  SELECT count(*) INTO current_count
    FROM tax_calculation_audits
   WHERE company_id = NEW.company_id;

  IF current_count >= max_count THEN
    RAISE EXCEPTION 'tax calculation audit quota exceeded for company %', NEW.company_id
      USING ERRCODE = '54000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_calculation_audit_quota ON tax_calculation_audits;
CREATE TRIGGER trg_tax_calculation_audit_quota
BEFORE INSERT ON tax_calculation_audits
FOR EACH ROW EXECUTE FUNCTION enforce_tax_calculation_audit_quota();
