-- Simples Nacional 2026 - Anexo III (serviços sujeitos ao Anexo III após enquadramento aplicável).
-- Source: LC 123/2006, Anexo III, consolidated Senate text.
INSERT INTO tax_rules
  (id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-4000-8000-000000000265',
  2026,
  'SIMPLES_NACIONAL_ANEXO_III_2026',
  'Simples Nacional 2026 - Anexo III Serviços',
  '2026.1',
  'https://legis.senado.gov.br/norma/572878/publicacao/34621013',
  'Lei Complementar 123/2006, Anexo III, texto consolidado consultado em 2026',
  '{"annex":"III","activity":"services","brackets":[{"max_revenue_12m":180000,"nominal_rate":0.06,"deduction":0},{"max_revenue_12m":360000,"nominal_rate":0.112,"deduction":9360},{"max_revenue_12m":720000,"nominal_rate":0.135,"deduction":17640},{"max_revenue_12m":1800000,"nominal_rate":0.16,"deduction":35640},{"max_revenue_12m":3600000,"nominal_rate":0.21,"deduction":125640},{"max_revenue_12m":4800000,"nominal_rate":0.33,"deduction":648000}]}',
  '2026-01-01','2026-12-31',true
)
ON CONFLICT (tax_year,code,version) DO NOTHING;
