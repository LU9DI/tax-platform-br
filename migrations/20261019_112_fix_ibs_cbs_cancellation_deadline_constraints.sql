-- Fix inverted cancellation-deadline invariants on the IBS/CBS option ledger.
--
-- Earlier migrations required cancellation_deadline >= effective_from. That is
-- backwards for the normative calendar: the deadline to cancel an option always
-- falls BEFORE the period it governs becomes effective (for example, the
-- first-semester deadline 2026-12-20 vs. effective_from 2027-01-01, and the
-- second-semester deadline 2027-05-31 vs. effective_from 2027-07-01). With those
-- constraints every legitimate election was rejected by the database.
--
-- Replacement invariant: when present, the deadline cannot precede the start of
-- the option window and cannot fall after the end of the governed period.
-- Historical migrations stay immutable; this one supersedes them.

-- Drop every CHECK that constrains cancellation_deadline, regardless of whether
-- PostgreSQL auto-named it (inline table CHECK) or it was named explicitly.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'tax_company_ibs_cbs_option_events'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%cancellation_deadline%'
  LOOP
    EXECUTE format('ALTER TABLE tax_company_ibs_cbs_option_events DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE tax_company_ibs_cbs_option_events
  ADD CONSTRAINT tax_company_ibs_cbs_option_events_cancellation_deadline_check
  CHECK (
    cancellation_deadline IS NULL
    OR (
      cancellation_deadline >= option_window_start
      AND cancellation_deadline <= effective_to
    )
  );
