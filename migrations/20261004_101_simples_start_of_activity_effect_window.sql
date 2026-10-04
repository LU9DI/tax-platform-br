-- Normative completion: Resolução CGSN nº 186/2026, art. 3, with wording retained
-- by Resolução CGSN nº 194/2026. For companies registering in the special
-- Simples Nacional start-of-activity window, the option produces effects for
-- the 2027 calendar year. Keep this in versioned rule data rather than code.
UPDATE tax_rules
SET parameters = jsonb_set(
  parameters,
  '{start_of_activity,simples_nacional_effective_window}',
  jsonb_build_object('start','2027-01-01','end','2027-12-31'),
  true
)
WHERE id = '00000000-0000-4000-8000-000000000274'
  AND code = 'SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027'
  AND version = '2027.2';
