-- Versioned standard MEI 2027 rule (Table A).
-- STATUS: PROVISÓRIO — não há norma definitiva publicada para 2027 até a data desta migração.
-- Os parâmetros abaixo usam os mesmos valores de 2026 como baseline, mas NÃO estão confirmados
-- para o exercício de 2027 por ato normativo próprio. Não apresentar como regra fiscal oficialmente
-- validada para 2027 até confirmação pela Receita Federal / Portal do Simples Nacional.
-- Keep legal amounts in tax_rules parameters; calculation code must not embed them.
-- Source: Portal do Simples Nacional / Perguntas e Respostas do MEI (página geral, sem ato específico de 2027).
-- Standard MEI only; MEI Caminhoneiro has a separate legal table and is intentionally excluded.

-- Retire any previously active MEI_2027 rule before installing this provisional version.
-- The effectivity guard intentionally rejects overlapping active validity periods.
UPDATE tax_rules
SET active = false
WHERE code = 'MEI_2027'
  AND tax_year = 2027
  AND active = true;

INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-0000-0000-000000000278',
  2027,
  'MEI_2027',
  'MEI 2027 - regra padrão (PROVISÓRIO)',
  '2027.1-provisorio',
  'https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/perguntas-frequentes',
  'MEI 2027 - parâmetros provisórios usando valores de 2026 como baseline; não confirmados por ato normativo de 2027',
  '{"annual_limit":81000,"monthly_das":{"services":86.05,"commerce":82.05,"commerce_services":87.05},"inss":{"amount":81.05,"rate":0.05,"rate_basis":"minimum_wage","minimum_wage":1621},"tax_components":{"iss":5,"icms":1},"proportional_limit_basis":"annual_limit_divided_by_12_times_months_of_activity","transport_cargas_supported":false,"status":"provisorio","confirmacao_2027_pendente":true}',
  '2027-01-01','2027-12-31',true
)
ON CONFLICT (tax_year, code, version) DO UPDATE SET name = EXCLUDED.name, source_url = EXCLUDED.source_url, source_reference = EXCLUDED.source_reference, parameters = EXCLUDED.parameters, effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to, active = EXCLUDED.active;