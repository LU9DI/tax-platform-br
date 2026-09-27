-- Idempotency for tax calculations: retries must not create duplicate historical evidence.
ALTER TABLE tax_calculation_audits
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_calculation_audits_idempotency
  ON tax_calculation_audits(company_id, calculation_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tax_calculation_audits_fingerprint
  ON tax_calculation_audits(request_fingerprint)
  WHERE request_fingerprint IS NOT NULL;
