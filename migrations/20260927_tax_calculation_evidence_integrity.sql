-- Strengthen tax calculation evidence so historical results remain reproducible.
-- New calculations must always point to the exact tax rule row used.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tax_calculation_audits WHERE rule_version_id IS NULL) THEN
    RAISE EXCEPTION 'cannot enforce rule_version_id NOT NULL: legacy audit rows are missing rule references';
  END IF;
END $$;

ALTER TABLE tax_calculation_audits
  ALTER COLUMN rule_version_id SET NOT NULL;

-- A company deletion must not silently erase historical tax evidence.
ALTER TABLE tax_calculation_audits
  DROP CONSTRAINT IF EXISTS tax_calculation_audits_company_id_fkey;

ALTER TABLE tax_calculation_audits
  ADD CONSTRAINT tax_calculation_audits_company_id_fkey
  FOREIGN KEY (company_id)
  REFERENCES tax_companies(id)
  ON DELETE RESTRICT;

-- Calculation evidence is append-only. Corrections must create a new calculation
-- rather than mutating historical evidence.
CREATE OR REPLACE FUNCTION prevent_tax_calculation_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tax_calculation_audits is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_calculation_audits_immutable ON tax_calculation_audits;
CREATE TRIGGER trg_tax_calculation_audits_immutable
BEFORE UPDATE OR DELETE ON tax_calculation_audits
FOR EACH ROW EXECUTE FUNCTION prevent_tax_calculation_audit_mutation();

CREATE INDEX IF NOT EXISTS idx_tax_calculation_audits_company_type_created
  ON tax_calculation_audits(company_id, calculation_type, created_at DESC);
