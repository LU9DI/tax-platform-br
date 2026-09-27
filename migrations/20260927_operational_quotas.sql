CREATE TABLE IF NOT EXISTS api_rate_limit_windows (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  bucket_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_windows_bucket
  ON api_rate_limit_windows(bucket_start);

CREATE TABLE IF NOT EXISTS tax_calculation_quota (
  company_id UUID PRIMARY KEY REFERENCES tax_companies(id) ON DELETE CASCADE,
  evidence_count BIGINT NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
