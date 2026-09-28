-- Simples Nacional 2026 - Fator R.
-- Sources: LC 123/2006, art. 18, §§ 5º-J a 5º-M; Resolução CGSN 140/2018, art. 26; Receita Federal PGDAS-D.
INSERT INTO tax_rules
  (id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-4000-8000-000000000267',
  2026,
  'SIMPLES_NACIONAL_FATOR_R_2026',
  'Simples Nacional 2026 - Fator R',
  '2026.1',
  'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
  'Lei Complementar 123/2006, art. 18, §§ 5º-J a 5º-M; Resolução CGSN 140/2018, art. 26; Perguntas e Respostas do Simples Nacional',
  '{"threshold":0.28,"period_months":12,"ratio":"FS12/RBT12","fs12":{"includes":["employee_and_avulso_remuneration","individual_contributor_remuneration","13th_salary","employer_social_security_contribution","FGTS"],"excludes_examples":["rent","profit_distribution","intern_payments","MEI_payments"]},"rbt12":{"basis":"revenue_accrued_in_the_12_months_before_calculation_period"},"selection":{"greater_or_equal_threshold":"III","below_threshold":"V"}}',
  '2026-01-01','2026-12-31',true
)
ON CONFLICT (tax_year,code,version) DO NOTHING;
