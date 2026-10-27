-- A cancellation deadline may precede the effective period: the 2027 option can be
-- cancelled during the 2026 election window. The original migration included an
-- unnamed table CHECK with the opposite inequality, and migration 102 added a
-- named CHECK with the same mistake. Remove both and keep one correct invariant.
ALTER TABLE tax_company_ibs_cbs_option_events
  DROP CONSTRAINT IF EXISTS tax_company_ibs_cbs_option_events_cancellation_deadline_check;

ALTER TABLE tax_company_ibs_cbs_option_events
  DROP CONSTRAINT IF EXISTS tax_company_ibs_cbs_option_events_check2;

ALTER TABLE tax_company_ibs_cbs_option_events
  ADD CONSTRAINT tax_company_ibs_cbs_option_events_cancellation_deadline_check
  CHECK (
    cancellation_deadline <= effective_from
    OR cancellation_deadline IS NULL
  );
