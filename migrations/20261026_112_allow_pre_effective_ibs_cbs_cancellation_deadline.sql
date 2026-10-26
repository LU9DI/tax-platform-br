-- A cancellation deadline may precede the effective period: the 2027 option can be
-- cancelled during the 2026 election window. The date column itself enforces date validity.
ALTER TABLE tax_company_ibs_cbs_option_events
  DROP CONSTRAINT IF EXISTS tax_company_ibs_cbs_option_events_cancellation_deadline_check;
