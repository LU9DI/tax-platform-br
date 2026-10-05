-- Normative rule: 2027 Simples Nacional revenue composition.
-- The regular IBS/CBS amounts are excluded from the gross revenue considered
-- for Simples Nacional when the taxpayer uses the regular IBS/CBS model.
-- Keep this rule separate from the IBS/CBS option-window rule so historical
-- option decisions and revenue composition remain independently versioned.

INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-4000-8000-000000000275',
  2027,
  'SIMPLES_NACIONAL_REVENUE_COMPOSITION_2027',
  'Simples Nacional 2027 - Composição da Receita com IBS/CBS Regular',
  '2027.1',
  'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/cgsn-atualiza-regras-do-simples-nacional-para-adequacao-a-reforma-tributaria-do-consumo',
  'Resoluções CGSN nº 190 e nº 191/2026; adequação da receita bruta do Simples Nacional à Reforma Tributária do Consumo, com exclusão dos valores de IBS e CBS recolhidos pelo regime regular.',
  '{
    "year": 2027,
    "monthly_basis": "gross_revenue_accrued",
    "regular_ibs_cbs_excluded_from_simples_gross_revenue": true,
    "exclusion_basis": "regular_ibs_cbs_amount"
  }'::jsonb,
  '2027-01-01',
  '2027-12-31',
  true
)
ON CONFLICT (id) DO UPDATE SET
  tax_year=EXCLUDED.tax_year,
  code=EXCLUDED.code,
  name=EXCLUDED.name,
  version=EXCLUDED.version,
  source_url=EXCLUDED.source_url,
  source_reference=EXCLUDED.source_reference,
  parameters=EXCLUDED.parameters,
  effective_from=EXCLUDED.effective_from,
  effective_to=EXCLUDED.effective_to,
  active=EXCLUDED.active;
