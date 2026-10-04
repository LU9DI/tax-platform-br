-- Fator R zero-case outcomes are normative parameters, not service constants.
-- Sources: Resolução CGSN nº 140/2018, art. 26, §§ 6º-7º;
-- Resolução CGSN nº 190/2026, with effects from 01/01/2027.

UPDATE tax_rules
SET parameters = parameters
  || jsonb_build_object(
    'zero_both_factor', 0.01,
    'zero_revenue_factor', 0.28,
    'zero_fs_factor', 0.01
  )
WHERE code IN ('SIMPLES_NACIONAL_FATOR_R_2026','SIMPLES_NACIONAL_FATOR_R_2027')
  AND active = true;
