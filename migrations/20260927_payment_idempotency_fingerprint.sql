CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE tax_payments
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

UPDATE tax_payments
SET request_fingerprint = encode(
  digest(
    json_build_array(
      company_id::text,
      to_char(reference_month, 'YYYY-MM'),
      to_char(amount, 'FM999999999999990.00'),
      tax_code,
      paid_at::text
    )::text,
    'sha256'
  ),
  'hex'
)
WHERE idempotency_key IS NOT NULL
  AND request_fingerprint IS NULL;

ALTER TABLE tax_payments
  ADD CONSTRAINT tax_payments_idempotency_fingerprint_check
  CHECK (
    (idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR
    (idempotency_key IS NOT NULL AND request_fingerprint IS NOT NULL)
  );
