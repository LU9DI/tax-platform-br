-- Fiscal documents become the primary auditable source for 2027 revenue recognition.
-- No tax values are hardcoded here: classification and normative basis are explicit.

CREATE TABLE IF NOT EXISTS tax_fiscal_documents (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES tax_companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  access_key TEXT,
  document_number TEXT,
  series TEXT,
  issued_at TIMESTAMPTZ NOT NULL,
  total_amount NUMERIC(20,2) NOT NULL CHECK (total_amount >= 0),
  revenue_amount NUMERIC(20,2) NOT NULL CHECK (revenue_amount >= 0 AND revenue_amount <= total_amount),
  regular_ibs_cbs_amount NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (regular_ibs_cbs_amount >= 0 AND regular_ibs_cbs_amount <= revenue_amount),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','rectified')),
  classification_status TEXT NOT NULL DEFAULT 'pending' CHECK (classification_status IN ('pending','classified','rejected')),
  classification_code TEXT,
  classification_basis TEXT,
  classification_rule_version_id UUID REFERENCES tax_rules(id) ON DELETE RESTRICT,
  source TEXT NOT NULL DEFAULT 'fiscal_document',
  external_id TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  supersedes_document_id UUID REFERENCES tax_fiscal_documents(id) ON DELETE RESTRICT,
  rectified_by_document_id UUID REFERENCES tax_fiscal_documents(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, document_type, access_key),
  UNIQUE(company_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_tax_fiscal_documents_company_issued ON tax_fiscal_documents(company_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_tax_fiscal_documents_company_status ON tax_fiscal_documents(company_id, status, classification_status);
CREATE INDEX IF NOT EXISTS idx_tax_fiscal_documents_rule ON tax_fiscal_documents(classification_rule_version_id);

-- A fiscal document can be replaced at most once. This prevents two active rectifications
-- from competing as the authoritative replacement for the same source document.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_fiscal_documents_one_rectifier
  ON tax_fiscal_documents(supersedes_document_id)
  WHERE supersedes_document_id IS NOT NULL;

ALTER TABLE tax_revenues ADD COLUMN IF NOT EXISTS revenue_basis TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE tax_revenues ADD COLUMN IF NOT EXISTS fiscal_document_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tax_revenues ADD CONSTRAINT tax_revenues_revenue_basis_check CHECK (revenue_basis IN ('manual','fiscal_documents'));

CREATE OR REPLACE FUNCTION tax_fiscal_documents_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_tax_fiscal_documents_updated_at ON tax_fiscal_documents;
CREATE TRIGGER trg_tax_fiscal_documents_updated_at BEFORE UPDATE ON tax_fiscal_documents FOR EACH ROW EXECUTE FUNCTION tax_fiscal_documents_touch_updated_at();

CREATE OR REPLACE FUNCTION tax_fiscal_documents_validate_rectification()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_company UUID;
  parent_status TEXT;
  parent_rectifier UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.supersedes_document_id IS DISTINCT FROM OLD.supersedes_document_id THEN
    RAISE EXCEPTION 'rectification source document is immutable after creation';
  END IF;

  IF NEW.supersedes_document_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.id = NEW.supersedes_document_id THEN
    RAISE EXCEPTION 'rectification source document cannot reference itself';
  END IF;

  SELECT company_id, status, rectified_by_document_id
    INTO parent_company, parent_status, parent_rectifier
    FROM tax_fiscal_documents
   WHERE id = NEW.supersedes_document_id
   FOR UPDATE;

  IF parent_company IS NULL OR parent_company <> NEW.company_id THEN
    RAISE EXCEPTION 'rectification source document must belong to the same company';
  END IF;

  IF parent_status <> 'active' OR parent_rectifier IS NOT NULL THEN
    RAISE EXCEPTION 'rectification source document must be active and not already rectified';
  END IF;

  RETURN NEW;
END;
$;

$$;
DROP TRIGGER IF EXISTS trg_tax_fiscal_documents_rectification ON tax_fiscal_documents;
CREATE TRIGGER trg_tax_fiscal_documents_rectification BEFORE INSERT OR UPDATE ON tax_fiscal_documents FOR EACH ROW EXECUTE FUNCTION tax_fiscal_documents_validate_rectification();

CREATE OR REPLACE FUNCTION tax_fiscal_documents_apply_rectification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.supersedes_document_id IS NULL THEN RETURN NEW; END IF;

  UPDATE tax_fiscal_documents
     SET status = 'rectified',
         rectified_by_document_id = NEW.id,
         updated_at = now()
   WHERE id = NEW.supersedes_document_id
     AND company_id = NEW.company_id
     AND status = 'active';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_fiscal_documents_apply_rectification ON tax_fiscal_documents;
CREATE TRIGGER trg_tax_fiscal_documents_apply_rectification
AFTER INSERT OR UPDATE OF supersedes_document_id ON tax_fiscal_documents
FOR EACH ROW EXECUTE FUNCTION tax_fiscal_documents_apply_rectification();
