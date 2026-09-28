-- Simples Nacional 2027 - Fator R, versioned separately from 2026.
-- Source: Resolução CGSN nº 190, de 04/08/2026, with effects from 01/01/2027.
INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
('00000000-0000-4000-8000-000000000269',2027,'SIMPLES_NACIONAL_FATOR_R_2027','Simples Nacional 2027 - Fator R','2027.1',
'https://normas.receita.fazenda.gov.br/sijut2consulta/consulta.action?orgaosSelecionados=CGSN&tipoData=2',
'Resolução CGSN nº 190, de 04/08/2026, art. 1º e alterações do art. 26 da Resolução CGSN nº 140/2018; efeitos a partir de 01/01/2027.',
'{"threshold":0.28,"period_months":12,"ratio":"FS12_RBT12r","window_basis":"12_months_antecedent_to_month_before_PA","startup_fixed_months":2,"startup_fixed_factor":0.28,"startup_after_second_month_basis":"FS12_RBT12r","fs12":{"includes":["employee_and_avulso_remuneration","individual_contributor_remuneration","13th_salary","employer_social_security_contribution","FGTS"]},"selection":{"greater_or_equal_threshold":"III","below_threshold":"V"}}',
'2027-01-01','2027-12-31',true)
ON CONFLICT (tax_year,code,version) DO NOTHING;