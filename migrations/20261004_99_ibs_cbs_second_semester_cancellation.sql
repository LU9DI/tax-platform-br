-- Normative state update: second-semester IBS/CBS option cycle.
-- Resolução CGSN nº 190/2026 establishes the recurring March option/renunciation
-- cycle; the official CGSN guidance states that the 2027 second-semester option
-- may be cancelled through 2027-05-31.
UPDATE tax_rules
SET parameters = jsonb_set(
  jsonb_set(
    parameters,
    '{second_semester,cancellation_window}',
    '{"start":"2027-03-01","end":"2027-05-31"}'::jsonb,
    true
  ),
  '{second_semester,cancellation_deadline}',
  '"2027-05-31"'::jsonb,
  true
)
WHERE id = '00000000-0000-4000-8000-000000000274'
  AND code = 'SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027';
