-- Canonical 2026 tax parameters used by calculators.
-- Sources: official gov.br pages for MEI 2026 and RTC 2026 transition.
INSERT INTO tax_rules
  (id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
  (
    '00000000-0000-4000-8000-000000000261',
    2026,
    'MEI_2026',
    'MEI 2026 - limite e DAS',
    '2026.1',
    'https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/perguntas-frequentes/pagamento-da-contribuicao-mensal-carne-mensal/qual-o-valor-das-contribuicoes',
    'Atualização de 02/01/2026; valores do DAS-MEI de 2026',
    '{"annual_limit":81000,"monthly_das":{"commerce":82.05,"services":86.05,"commerce_services":87.05}}'::jsonb,
    '2026-01-01','2026-12-31',true
  ),
  (
    '00000000-0000-4000-8000-000000000262',
    2026,
    'RTC_CONSUMPTION_2026',
    'Reforma Tributária do Consumo - transição 2026',
    '2026.1',
    'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/entenda',
    'Transição 2026: CBS 0,9% e IBS 0,1%',
    '{"cbs_rate":0.009,"ibs_rate":0.001}'::jsonb,
    '2026-01-01','2026-12-31',true
  )
ON CONFLICT (tax_year,code,version) DO NOTHING;