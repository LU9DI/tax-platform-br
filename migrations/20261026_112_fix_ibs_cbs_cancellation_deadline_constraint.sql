-- Cancellation deadlines for a tax option must be no later than the
-- effective period start. The earlier constraint had the inequality reversed,
-- rejecting legally modelled deadlines such as 2026-11-03 for a 2027-01-01 period.
ALTER TABLE tax_company_ibs_cbs_option_events
  DROP CONSTRAINT IF EXISTS tax_company_ibs_cbs_option_events_cancellation_deadline_check;

-- The original inline table CHECK may also remain under PostgreSQL's generated
-- name. Remove it so there is only one authoritative deadline constraint.
ALTER TABLE tax_company_ibs_cbs_option_events
  DROP CONSTRAINT IF EXISTS tax_company_ibs_cbs_option_events_check2;

ALTER TABLE tax_company_ibs_cbs_option_events
  ADD CONSTRAINT tax_company_ibs_cbs_option_events_cancellation_deadline_check
  CHECK (
    cancellation_deadline <= effective_from
    OR cancellation_deadline IS NULL
  );
