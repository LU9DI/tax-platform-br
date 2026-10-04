-- Versioned Fator R zero-case outcomes.
-- Do not mutate historical tax-rule versions in place.
-- Sources: Resolução CGSN nº 140/2018, art. 26, §§ 6º-7º;
-- Resolução CGSN nº 190/2026, with effects from 01/01/2027.

UPDATE tax_rules
SET active = false
WHERE id IN (
  '00000000-0000-4000-8000-000000000267',
  '00000000-0000-4000-8000-000000000269'
);

INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-4000-8000-000000000275',
  2026,
  'SIMPLES_NACIONAL_FATOR_R_2026',
  'Simples Nacional 2026 - Fator R',
  '2026.2',
  'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
  'Lei Complementar 123/2006, art. 18, §§ 5º-J a 5º-M; Resolução CGSN 140/2018, art. 26; Perguntas e Respostas do Simples Nacional',
  '{"threshold":0.28,"period_months":12,"ratio":"FS12/RBT12","zero_both_factor":0.01,"zero_revenue_factor":0.28,"zero_fs_factor":0.01,"fs12":{"includes":["employee_and_avulso_remuneration","individual_contributor_remuneration","13th_salary","employer_social_security_contribution","FGTS"],"excludes_examples":["rent","profit_distribution","intern_payments","MEI_payments"]},"rbt12":{"basis":"revenue_accrued_in_the_12_months_before_calculation_period"},"selection":{"greater_or_equal_threshold":"III","below_threshold":"V"}}',
  '2026-01-01','2026-12-31',true
)
ON CONFLICT (tax_year,code,version) DO NOTHING;

INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-4000-8000-000000000276',
  2027,
  'SIMPLES_NACIONAL_FATOR_R_2027',
  'Simples Nacional 2027 - Fator R',
  '2027.2',
  'https://normas.receita.fazenda.gov.br/sijut2consulta/consulta.action?orgaosSelecionados=CGSN&tipoData=2',
  'Resolução CGSN nº 190, de 04/08/2026, art. 1º e alterações do art. 26 da Resolução CGSN nº 140/2018; efeitos a partir de 01/01/2027.',
  '{"threshold":0.28,"period_months":12,"ratio":"FS12/RBT12","window_basis":"12_months_antecedent_to_month_before_PA","startup_fixed_months":2,"startup_fixed_factor":0.28,"zero_both_factor":0.01,"zero_revenue_factor":0.28,"zero_fs_factor":0.01,"startup_after_second_month_basis":"FS12/RBT12","fs12":{"includes":["employee_and_avulso_remuneration","individual_contributor_remuneration","13th_salary","employer_social_security_contribution","FGTS"]},"selection":{"greater_or_equal_threshold":"III","below_threshold":"V"}}',
  '2027-01-01','2027-12-31',true
)
ON CONFLICT (tax_year,code,version) DO NOTHING;
