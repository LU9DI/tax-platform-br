-- Normative correction: distinguish the Simples Nacional and regular IBS/CBS
-- start-of-activity CNPJ windows established by Resolução CGSN nº 194/2026, art. 3.
-- Simples Nacional: 2026-10-16 through 2026-12-31.
-- Regular IBS/CBS: 2026-10-31 through 2026-12-31.
UPDATE tax_rules
SET parameters = jsonb_set(
  parameters,
  '{start_of_activity}',
  jsonb_build_object(
    'simples_nacional_cnpj_registration_window', jsonb_build_object('start','2026-10-16','end','2026-12-31'),
    'ibs_cbs_cnpj_registration_window', jsonb_build_object('start','2026-10-31','end','2026-12-31'),
    'option_at_cnpj_registration', true,
    'ibs_cbs_effective_window', jsonb_build_object('start','2027-01-01','end','2027-06-30'),
    'effect_basis', 'cnpj_registration_for_ibs_cbs'
  ),
  true
)
WHERE id = '00000000-0000-4000-8000-000000000274'
  AND code = 'SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027';