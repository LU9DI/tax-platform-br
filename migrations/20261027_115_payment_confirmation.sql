-- Tabela de confirmacoes de pagamento para integridade do billing.
-- Impede alteracao direta de plano sem pagamento confirmado.
-- Cada pagamento confirmado gera um registro que autoriza a mudanca de plano.
CREATE TABLE IF NOT EXISTS payment_confirmations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES tax_companies(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES tax_payments(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK(amount>=0),
  plan TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  webhook_id TEXT,
  webhook_signature TEXT,
  idempotency_key TEXT NOT NULL,
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_confirmations_user ON payment_confirmations(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_company ON payment_confirmations(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_idempotency ON payment_confirmations(idempotency_key);

-- Garante que so planos pagos podem ser ativados com pagamento confirmado.
-- O billingService deve verificar a existencia de um payment_confirmation
-- ativo antes de permitir changePlan para planos diferentes de 'free'.
CREATE TABLE IF NOT EXISTS plan_entitlements (
  id UUID PRIMARY KEY,
  plan TEXT NOT NULL,
  feature TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  limit_value INTEGER,
  UNIQUE(plan, feature)
);

-- Insercao de entitlements padrao para planos existentes.
INSERT INTO plan_entitlements (id, plan, feature, enabled, limit_value) VALUES
  ('00000000-0000-0000-0000-000000000301', 'free', 'companies', true, 3),
  ('00000000-0000-0000-0000-000000000302', 'free', 'calculations', true, 100),
  ('00000000-0000-0000-0000-000000000303', 'pro', 'companies', true, 10),
  ('00000000-0000-0000-0000-000000000304', 'pro', 'calculations', true, 1000),
  ('00000000-0000-0000-0000-000000000305', 'business', 'companies', true, 100),
  ('00000000-0000-0000-0000-000000000306', 'business', 'calculations', true, 10000)
ON CONFLICT (plan, feature) DO NOTHING;