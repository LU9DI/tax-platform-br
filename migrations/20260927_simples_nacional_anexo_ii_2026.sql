-- Simples Nacional 2026 - Anexo II (Indústria).
-- Source: LC 123/2006, Anexo II; 2026 table confirmed against current 2026 references.
INSERT INTO tax_rules
  (id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-4000-8000-000000000264',
  2026,
  'SIMPLES_NACIONAL_ANEXO_II_2026',
  'Simples Nacional 2026 - Anexo II Indústria',
  '2026.1',
  'https://www2.camara.leg.br/legin/fed/leicom/2006/leicomplementar-123-14-dezembro-2006-548099-normaatualizada-pl.html',
  'Lei Complementar 123/2006, Anexo II; tabela vigente em 2026',
  '{"annex":"II","activity":"industry","brackets":[{"max_revenue_12m":180000,"nominal_rate":0.045,"deduction":0},{"max_revenue_12m":360000,"nominal_rate":0.078,"deduction":5940},{"max_revenue_12m":720000,"nominal_rate":0.10,"deduction":13860},{"max_revenue_12m":1800000,"nominal_rate":0.112,"deduction":22500},{"max_revenue_12m":3600000,"nominal_rate":0.147,"deduction":85500},{"max_revenue_12m":4800000,"nominal_rate":0.30,"deduction":720000}]}',
  '2026-01-01','2026-12-31',true
)
ON CONFLICT (tax_year,code,version) DO NOTHING;
