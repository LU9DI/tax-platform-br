-- Database-level transition guard for the append-only IBS/CBS option ledger.
-- The service validates the same state machine, but this trigger prevents
-- impossible transitions from bypassing the application layer.

CREATE OR REPLACE FUNCTION validate_tax_company_ibs_cbs_option_event_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  last_event TEXT;
  first_semester_event TEXT;
BEGIN
  SELECT event_type
    INTO last_event
  FROM tax_company_ibs_cbs_option_events
  WHERE company_id = NEW.company_id
    AND effective_from = NEW.effective_from
    AND effective_to = NEW.effective_to
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1;

  IF last_event = 'cancelled' THEN
    RAISE EXCEPTION 'IBS/CBS option cycle is already terminal';
  END IF;

  IF NEW.event_type = 'elected' AND last_event IS NOT NULL THEN
    RAISE EXCEPTION 'IBS/CBS option cycle already has a decision';
  END IF;

  IF NEW.event_type = 'renounced' AND last_event IS NOT NULL THEN
    RAISE EXCEPTION 'IBS/CBS second-semester option cycle already has a decision';
  END IF;

  IF NEW.event_type = 'cancelled'
     AND last_event NOT IN ('elected', 'renounced') THEN
    RAISE EXCEPTION 'IBS/CBS cancellation requires an active election or renunciation';
  END IF;

  IF NEW.effective_from = DATE '2027-07-01'
     AND NEW.event_type = 'elected' THEN
    SELECT event_type
      INTO first_semester_event
    FROM tax_company_ibs_cbs_option_events
    WHERE company_id = NEW.company_id
      AND effective_from = DATE '2027-01-01'
      AND effective_to = DATE '2027-06-30'
    ORDER BY occurred_at DESC, id DESC
    LIMIT 1;

    IF first_semester_event = 'elected' THEN
      RAISE EXCEPTION 'second-semester election is unavailable while first-semester hybrid option remains active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tax_company_ibs_cbs_option_event_transition
  ON tax_company_ibs_cbs_option_events;

CREATE TRIGGER trg_validate_tax_company_ibs_cbs_option_event_transition
BEFORE INSERT ON tax_company_ibs_cbs_option_events
FOR EACH ROW
EXECUTE FUNCTION validate_tax_company_ibs_cbs_option_event_transition();
