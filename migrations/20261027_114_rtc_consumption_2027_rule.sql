-- Versioned RTC consumption 2027 rule.
-- STATUS: PROVISÓRIO — não há norma definitiva publicada para 2027 até a data desta migração.
-- Os parâmetros abaixo usam os mesmos valores de 2026 como baseline, mas NÃO estão confirmados
-- para o exercício de 2027 por ato normativo próprio. Não apresentar como regra fiscal oficialmente
-- validada para 2027 até confirmação por ato normativo da reforma tributária do consumo.
-- Keep legal rates in tax_rules parameters; calculation code must not embed them.
-- Sources: Emenda Constitucional nº 132/2023; Leis Complementares da Reforma Tributária do Consumo; Receita Federal (página geral, sem ato específico de 2027).

-- Retire any previously active RTC_CONSUMPTION_2027 rule before installing this provisional version.
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
  'Reforma Tributária do Consumo - transição 2027 (PROVISÓRIO)',
  '2027.1-provisorio',
  'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/entenda',
  'Transição 2027: CBS e IBS com base nas alíquotas de referência da reforma tributária do consumo; valores provisórios usando 2026 como baseline',
  '{"cbs_rate":0.009,"ibs_rate":0.001,"status":"provisorio","confirmacao_2027_pendente":true}',
  '2027-01-01','2027-12-31',true
)
ON CONFLICT (tax_year, code, version) DO UPDATE SET name = EXCLUDED.name, source_url = EXCLUDED.source_url, source_reference = EXCLUDED.source_reference, parameters = EXCLUDED.parameters, effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to, active = EXCLUDED.active;