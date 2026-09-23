ALTER TABLE tax_payments ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS tax_payments_company_idempotency_idx
  ON tax_payments(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
