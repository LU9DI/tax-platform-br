UPDATE tax_payments
SET request_fingerprint = encode(
  digest(
    concat_ws(
      '|',
      company_id::text,
      to_char(reference_month, 'YYYY-MM'),
      to_char(amount, 'FM999999999999990.00'),
      coalesce(tax_code, ''),
      coalesce(paid_at::text, '')
    ),
    'sha256'
  ),
  'hex'
)
WHERE idempotency_key IS NOT NULL;
