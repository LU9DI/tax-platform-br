-- Simples Nacional 2027 - IBS/CBS option framework.
-- Rates are intentionally absent: this rule models the option/effectivity state only.
INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
('00000000-0000-4000-8000-000000000273',2027,'SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027','Simples Nacional 2027 - Opções IBS/CBS','2027.1',
'https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/agosto/cgsn-atualiza-regras-do-simples-nacional-para-adequacao-a-reforma-tributaria-do-consumo',
'Resolução CGSN nº 186/2026 e Resoluções CGSN nº 190 e 191/2026; opção pelo regime regular de IBS/CBS para 01/01/2027-30/06/2027 e nova janela para 01/07/2027-31/12/2027.',
'{"models":["simples_puro","simples_hibrido"],"first_semester":{"start":"2027-01-01","end":"2027-06-30","option_window":{"start":"2026-09-01","end":"2026-09-30"},"cancellation_deadline":"2026-11-30"},"second_semester":{"start":"2027-07-01","end":"2027-12-31","option_window":{"start":"2027-03-01","end":"2027-03-31"},"cancellation_deadline":"2027-05-31"},"regular_ibs_cbs_rates":null,"note":"Do not calculate IBS/CBS regular rates from this rule; resolve the applicable normative tax rule separately."}',
'2027-01-01','2027-12-31',true)
ON CONFLICT (tax_year,code,version) DO NOTHING;