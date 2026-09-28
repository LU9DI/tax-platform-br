INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
('00000000-0000-4000-8000-000000000274',2027,'SIMPLES_NACIONAL_ANEXO_I_2027','Simples Nacional 2027 - Anexo I Comércio','2027.1',
'https://normas.receita.fazenda.gov.br/sijut2consulta/consulta.action?orgaosSelecionados=CGSN&tipoData=2',
'Resolução CGSN nº 190, de 04/08/2026, Anexo I; vigência 01/01/2027 a 31/12/2028.',
'{"annex":"I","activity":"commerce","brackets":[{"max_revenue_12m":180000,"nominal_rate":0.04,"deduction":0},{"max_revenue_12m":360000,"nominal_rate":0.073,"deduction":5940},{"max_revenue_12m":720000,"nominal_rate":0.095,"deduction":13860},{"max_revenue_12m":1800000,"nominal_rate":0.107,"deduction":22500},{"max_revenue_12m":3600000,"nominal_rate":0.143,"deduction":87300},{"max_revenue_12m":4800000,"nominal_rate":0.189,"deduction":378000}]}',
'2027-01-01','2027-12-31',true)
ON CONFLICT (tax_year,code,version) DO NOTHING;