-- Version the start-of-activity RBT12 proportionalization used by Simples Nacional 2027.
-- The calculation rule is stored with each annex rule so the audit trail preserves the normative basis.

UPDATE tax_rules
SET parameters = parameters || jsonb_build_object(
  'rbt12_start_of_activity', jsonb_build_object(
    'applicable_first_months', 12,
    'first_month_multiplier', 12,
    'subsequent_months_average_multiplier', 12
  )
)
WHERE tax_year = 2027
  AND code IN (
    'SIMPLES_NACIONAL_ANEXO_I_2027',
    'SIMPLES_NACIONAL_ANEXO_II_2027',
    'SIMPLES_NACIONAL_ANEXO_III_2027',
    'SIMPLES_NACIONAL_ANEXO_V_2027'
  )
  AND active = true;
