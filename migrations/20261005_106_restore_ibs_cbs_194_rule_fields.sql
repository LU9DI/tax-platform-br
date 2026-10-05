-- Normative repair: restore fields overwritten by the consolidated
-- Resolução CGSN nº 194/2026 rule publication.
--
-- The 2027.2 rule was later replaced as a whole by the 194 migration,
-- which dropped the previously separated start-of-activity windows and
-- the second-semester cancellation window. Keep the correction versioned
-- in a follow-up migration so historical migrations remain immutable.

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
  AND code = 'SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027'
  AND version = '2027.2';

UPDATE tax_rules
SET parameters = jsonb_set(
  parameters,
  '{start_of_activity}',
  '{
    "simples_nacional_cnpj_registration_window":{"start":"2026-10-16","end":"2026-12-31"},
    "simples_nacional_effective_window":{"start":"2027-01-01","end":"2027-12-31"},
    "ibs_cbs_cnpj_registration_window":{"start":"2026-10-31","end":"2026-12-31"},
    "option_at_cnpj_registration":true,
    "ibs_cbs_effective_window":{"start":"2027-01-01","end":"2027-06-30"},
    "effect_basis":"cnpj_registration_for_ibs_cbs"
  }'::jsonb,
  true
)
WHERE id = '00000000-0000-4000-8000-000000000274'
  AND code = 'SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027'
  AND version = '2027.2';
