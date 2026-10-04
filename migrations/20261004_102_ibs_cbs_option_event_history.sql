-- Historical hardening for IBS/CBS option events.
ALTER TABLE tax_company_ibs_cbs_option_events
  ADD COLUMN IF NOT EXISTS cancellation_window_start DATE,
  ADD COLUMN IF NOT EXISTS renunciation_window_start DATE,
  ADD COLUMN IF NOT EXISTS renunciation_window_end DATE;

ALTER TABLE tax_company_ibs_cbs_option_events
  DROP CONSTRAINT IF EXISTS tax_company_ibs_cbs_option_events_event_type_check;

ALTER TABLE tax_company_ibs_cbs_option_events
  ADD CONSTRAINT tax_company_ibs_cbs_option_events_event_type_check
  CHECK (event_type IN ('elected', 'cancelled', 'renounced'));

ALTER TABLE tax_company_ibs_cbs_option_events
  DROP CONSTRAINT IF EXISTS tax_company_ibs_cbs_option_events_model_check;

ALTER TABLE tax_company_ibs_cbs_option_events
  ADD CONSTRAINT tax_company_ibs_cbs_option_events_model_check
  CHECK (model IN ('simples_puro', 'simples_hibrido'));

ALTER TABLE tax_company_ibs_cbs_option_events
  DROP CONSTRAINT IF EXISTS tax_company_ibs_cbs_option_events_cancellation_deadline_check;

ALTER TABLE tax_company_ibs_cbs_option_events
  ADD CONSTRAINT tax_company_ibs_cbs_option_events_cancellation_deadline_check
  CHECK (
    cancellation_deadline >= effective_from
    OR cancellation_deadline IS NULL
  );

ALTER TABLE tax_company_ibs_cbs_option_events
  ALTER COLUMN cancellation_deadline DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tax_company_ibs_cbs_option_events_company_period_occurred
  ON tax_company_ibs_cbs_option_events(company_id, effective_from, effective_to, occurred_at DESC, id);
