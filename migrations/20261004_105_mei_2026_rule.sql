-- Versioned standard MEI 2026 rule (Table A).
-- Keep legal amounts in tax_rules parameters; calculation code must not embed them.
-- Source: Portal do Simples Nacional / Perguntas e Respostas do MEI, 2026.
-- Standard MEI only; MEI Caminhoneiro has a separate legal table and is intentionally excluded.

INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-0000-0000-000000000277',
  2026,
  'MEI_2026',
  'MEI 2026 - regra padrão',
  '2026.1',
  'https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/perguntas-frequentes',
  'MEI 2026 - limite anual e DAS mensal da regra padrão',
  '{"annual_limit":81000,"monthly_das":{"services":86.05,"commerce":82.05,"commerce_services":87.05},"inss":{"amount":81.05,"rate":0.05,"rate_basis":"minimum_wage","minimum_wage":1621},"tax_components":{"iss":5,"icms":1},"proportional_limit_basis":"annual_limit_divided_by_12_times_months_of_activity","transport_cargas_supported":false}',
  '2026-01-01','2026-12-31',true
)
ON CONFLICT (id) DO NOTHING;
