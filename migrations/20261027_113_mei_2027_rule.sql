-- Versioned standard MEI 2027 rule (Table A).
-- Keep legal amounts in tax_rules parameters; calculation code must not embed them.
-- Source: Portal do Simples Nacional / Perguntas e Respostas do MEI, 2027.
-- Standard MEI only; MEI Caminhoneiro has a separate legal table and is intentionally excluded.

-- Retire any previously active MEI_2027 rule before installing this authoritative version.
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
  'MEI 2027 - regra padrão',
  '2027.1',
  'https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/perguntas-frequentes',
  'MEI 2027 - limite anual e DAS mensal da regra padrão',
  '{"annual_limit":81000,"monthly_das":{"services":86.05,"commerce":82.05,"commerce_services":87.05},"inss":{"amount":81.05,"rate":0.05,"rate_basis":"minimum_wage","minimum_wage":1621},"tax_components":{"iss":5,"icms":1},"proportional_limit_basis":"annual_limit_divided_by_12_times_months_of_activity","transport_cargas_supported":false}',
  '2027-01-01','2027-12-31',true
)
ON CONFLICT (tax_year, code, version) DO UPDATE SET name = EXCLUDED.name, source_url = EXCLUDED.source_url, source_reference = EXCLUDED.source_reference, parameters = EXCLUDED.parameters, effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to, active = EXCLUDED.active;