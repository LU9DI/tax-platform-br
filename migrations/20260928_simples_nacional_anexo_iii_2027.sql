-- Simples Nacional 2027 - Anexo III.
INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
('00000000-0000-4000-8000-000000000270',2027,'SIMPLES_NACIONAL_ANEXO_III_2027','Simples Nacional 2027 - Anexo III Serviços','2027.1',
'https://normas.receita.fazenda.gov.br/sijut2consulta/consulta.action?orgaosSelecionados=CGSN&tipoData=2',
'Resolução CGSN nº 190, de 04/08/2026, Anexo III; vigência 01/01/2027 a 31/12/2028.',
'{"annex":"III","activity":"services_factor_r","brackets":[{"max_revenue_12m":180000,"nominal_rate":0.06,"deduction":0},{"max_revenue_12m":360000,"nominal_rate":0.112,"deduction":9360},{"max_revenue_12m":720000,"nominal_rate":0.135,"deduction":17640},{"max_revenue_12m":1800000,"nominal_rate":0.16,"deduction":35640},{"max_revenue_12m":3600000,"nominal_rate":0.21,"deduction":125640},{"max_revenue_12m":4800000,"nominal_rate":0.329,"deduction":648000}]}',
'2027-01-01','2027-12-31',true)
ON CONFLICT (tax_year,code,version) DO NOTHING;