-- Fiscal document integrity hardening.
-- Keep nullable access_key/external_id usable, but make provided identifiers idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_fiscal_documents_company_type_access_key
  ON tax_fiscal_documents(company_id, document_type, access_key)
  WHERE access_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_fiscal_documents_company_source_external_id
  ON tax_fiscal_documents(company_id, source, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE tax_fiscal_documents
  ADD CONSTRAINT tax_fiscal_documents_classification_rule_check
  CHECK (
    (classification_status = 'classified' AND classification_rule_version_id IS NOT NULL)
    OR classification_status <> 'classified'
  );

CREATE INDEX IF NOT EXISTS idx_tax_fiscal_documents_company_period
  ON tax_fiscal_documents(company_id, issued_at, status, classification_status);
