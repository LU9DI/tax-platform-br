-- Versioned RTC consumption 2027 rule.
-- Keep legal rates in tax_rules parameters; calculation code must not embed them.
-- Sources: Emenda Constitucional nº 132/2023; Leis Complementares da Reforma Tributária do Consumo; Receita Federal.

-- Retire any previously active RTC_CONSUMPTION_2027 rule before installing this authoritative version.
UPDATE tax_rules
SET active = false
WHERE code = 'RTC_CONSUMPTION_2027'
  AND tax_year = 2027
  AND active = true;

INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-0000-0000-000000000279',
  2027,
  'RTC_CONSUMPTION_2027',
  'Reforma Tributária do Consumo - transição 2027',
  '2027.1',
  'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/entenda',
  'Transição 2027: CBS e IBS com base nas alíquotas de referência da reforma tributária do consumo',
  '{"cbs_rate":0.009,"ibs_rate":0.001}',
  '2027-01-01','2027-12-31',true
)
ON CONFLICT (tax_year, code, version) DO UPDATE SET name = EXCLUDED.name, source_url = EXCLUDED.source_url, source_reference = EXCLUDED.source_reference, parameters = EXCLUDED.parameters, effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to, active = EXCLUDED.active;