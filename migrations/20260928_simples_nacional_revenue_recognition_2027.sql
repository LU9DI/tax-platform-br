-- Simples Nacional 2027 - revenue recognition framework.
-- This rule is informational/normative metadata; calculation engines must resolve it explicitly before using it.
INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
('00000000-0000-4000-8000-000000000272',2027,'SIMPLES_NACIONAL_REVENUE_RECOGNITION_2027','Simples Nacional 2027 - Reconhecimento da Receita','2027.1',
'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/regime-de-caixa-deixa-de-ser-utilizado-na-apuracao-do-simples-nacional',
'Resolução CGSN nº 190/2026; nova disciplina de reconhecimento da receita e extinção do regime de caixa para a apuração mensal, com efeitos a partir de 01/01/2027.',
'{"monthly_basis":"gross_revenue_accrued","cash_regime_for_monthly_calculation":false,"goods_services_recognition":"operation_billing","fiscal_document_as_general_reference":true}',
'2027-01-01','2027-12-31',true)
ON CONFLICT (tax_year,code,version) DO NOTHING;