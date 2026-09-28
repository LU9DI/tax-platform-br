-- Simples Nacional 2027 - Anexo V.
INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
('00000000-0000-4000-8000-000000000271',2027,'SIMPLES_NACIONAL_ANEXO_V_2027','Simples Nacional 2027 - Anexo V Serviços','2027.1',
'https://normas.receita.fazenda.gov.br/sijut2consulta/consulta.action?orgaosSelecionados=CGSN&tipoData=2',
'Resolução CGSN nº 190, de 04/08/2026, Anexo V; vigência 01/01/2027 a 31/12/2028.',
'{"annex":"V","activity":"services_factor_r","brackets":[{"max_revenue_12m":180000,"nominal_rate":0.155,"deduction":0},{"max_revenue_12m":360000,"nominal_rate":0.18,"deduction":4500},{"max_revenue_12m":720000,"nominal_rate":0.195,"deduction":9900},{"max_revenue_12m":1800000,"nominal_rate":0.205,"deduction":17100},{"max_revenue_12m":3600000,"nominal_rate":0.23,"deduction":62100},{"max_revenue_12m":4800000,"nominal_rate":0.304,"deduction":540000}]}',
'2027-01-01','2027-12-31',true)
ON CONFLICT (tax_year,code,version) DO NOTHING;