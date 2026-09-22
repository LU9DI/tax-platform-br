CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);

CREATE TABLE IF NOT EXISTS tax_profiles (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  taxpayer_type TEXT NOT NULL CHECK (taxpayer_type IN ('individual','accountant','business')),
  country TEXT NOT NULL DEFAULT 'BR', state TEXT, tax_year INTEGER NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,tax_year)
);
CREATE INDEX IF NOT EXISTS idx_tax_profiles_user_year ON tax_profiles(user_id,tax_year DESC);

CREATE TABLE IF NOT EXISTS tax_rules (
  id UUID PRIMARY KEY,
  tax_year INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  parameters JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tax_year,code,version)
);
CREATE INDEX IF NOT EXISTS idx_tax_rules_year_active ON tax_rules(tax_year,active);