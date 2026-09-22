CREATE TABLE IF NOT EXISTS app_users (id UUID PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE TABLE IF NOT EXISTS tax_profiles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  taxpayer_type TEXT NOT NULL CHECK (taxpayer_type IN ('individual','accountant','business')),
  country TEXT NOT NULL DEFAULT 'BR',
  state TEXT,
  tax_year INTEGER NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tax_year)
);
CREATE INDEX IF NOT EXISTS idx_tax_profiles_user ON tax_profiles(user_id, tax_year DESC);