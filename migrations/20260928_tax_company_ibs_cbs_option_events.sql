CREATE TABLE IF NOT EXISTS tax_company_ibs_cbs_option_events (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES tax_companies(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('elected', 'cancelled')),
  model TEXT NOT NULL CHECK (model = 'simples_hibrido'),
  effective_from DATE NOT NULL,
  effective_to DATE NOT NULL,
  option_window_start DATE NOT NULL,
  option_window_end DATE NOT NULL,
  cancellation_deadline DATE NOT NULL,
  rule_version_id UUID NOT NULL REFERENCES tax_rules(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'tax_platform',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_from <= effective_to),
  CHECK (option_window_start <= option_window_end),
  CHECK (effective_from <= cancellation_deadline)
);

CREATE INDEX IF NOT EXISTS idx_tax_company_ibs_cbs_option_events_company_period
  ON tax_company_ibs_cbs_option_events(company_id, effective_from, effective_to, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_tax_company_ibs_cbs_option_events_rule
  ON tax_company_ibs_cbs_option_events(rule_version_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_company_ibs_cbs_option_event_period_type
  ON tax_company_ibs_cbs_option_events(company_id, effective_from, effective_to, event_type);

CREATE OR REPLACE FUNCTION prevent_tax_company_ibs_cbs_option_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tax_company_ibs_cbs_option_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_company_ibs_cbs_option_events_immutable
  ON tax_company_ibs_cbs_option_events;

CREATE TRIGGER trg_tax_company_ibs_cbs_option_events_immutable
BEFORE UPDATE OR DELETE ON tax_company_ibs_cbs_option_events
FOR EACH ROW
EXECUTE FUNCTION prevent_tax_company_ibs_cbs_option_event_mutation();

CREATE OR REPLACE FUNCTION validate_tax_company_ibs_cbs_option_event_rule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rule_code TEXT;
BEGIN
  SELECT code INTO rule_code
  FROM tax_rules
  WHERE id = NEW.rule_version_id;

  IF rule_code IS NULL THEN
    RAISE EXCEPTION 'IBS/CBS option event requires an existing tax rule';
  END IF;

  IF rule_code <> 'SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' THEN
    RAISE EXCEPTION 'invalid IBS/CBS option rule code: %', rule_code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tax_company_ibs_cbs_option_event_rule
  ON tax_company_ibs_cbs_option_events;

CREATE TRIGGER trg_validate_tax_company_ibs_cbs_option_event_rule
BEFORE INSERT ON tax_company_ibs_cbs_option_events
FOR EACH ROW
EXECUTE FUNCTION validate_tax_company_ibs_cbs_option_event_rule();
