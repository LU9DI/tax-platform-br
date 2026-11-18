-- Tabela de revogacao de tokens JWT.
-- Armazena tokens revogados para invalidao efetiva de sessoes.
-- Integrada com o middleware de autenticacao para verificar revocacao
-- antes de conceder acesso a endpoints protegidos.
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL DEFAULT 'logout',
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(token_id)
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user ON revoked_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_token_id ON revoked_tokens(token_id);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);

-- Limpeza automatica de tokens expirados deve ser executada periodicamente.
-- Nao fazer DELETE em producao sem analise de impacto.