-- Simples Nacional 2026 - Anexo V (serviços sujeitos ao fator R quando fator R < 28%).
-- Source: LC 123/2006, Anexo V, consolidated Senate text.
INSERT INTO tax_rules
  (id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-4000-8000-000000000266',
  2026,
  'SIMPLES_NACIONAL_ANEXO_V_2026',
  'Simples Nacional 2026 - Anexo V Serviços',
  '2026.1',
  'https://legis.senado.gov.br/norma/572878/publicacao/34621013',
  'Lei Complementar 123/2006, Anexo V, texto consolidado consultado em 2026',
  '{"annex":"V","activity":"services_factor_r","brackets":[{"max_revenue_12m":180000,"nominal_rate":0.155,"deduction":0},{"max_revenue_12m":360000,"nominal_rate":0.18,"deduction":4500},{"max_revenue_12m":720000,"nominal_rate":0.195,"deduction":9900},{"max_revenue_12m":1800000,"nominal_rate":0.205,"deduction":17100},{"max_revenue_12m":3600000,"nominal_rate":0.23,"deduction":62100},{"max_revenue_12m":4800000,"nominal_rate":0.305,"deduction":540000}]}',
  '2026-01-01','2026-12-31',true
)
ON CONFLICT (tax_year,code,version) DO NOTHING;
