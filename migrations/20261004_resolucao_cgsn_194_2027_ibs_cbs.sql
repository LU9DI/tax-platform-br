-- Normative update: Resolução CGSN nº 194/2026 (published 2026-09-28).
-- Preserve the prior rule for historical calculations; do not rewrite its parameters.
UPDATE tax_rules
SET active = false
WHERE id = '00000000-0000-4000-8000-000000000273'
  AND code = 'SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027'
  AND version = '2027.1';

INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
('00000000-0000-4000-8000-000000000274',2027,'SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027','Simples Nacional 2027 - Opções IBS/CBS','2027.2',
'https://normas.receita.fazenda.gov.br/sijut2consulta/consulta.action?termoBusca=Resolu%C3%A7%C3%A3o+CGSN+194+2026',
'Resolução CGSN nº 194/2026, publicada em 28/09/2026; altera a Resolução CGSN nº 186/2026 quanto aos prazos e condições para o ano-calendário de 2027.',
'{
  "models":["simples_puro","simples_hibrido"],
  "first_semester":{
    "start":"2027-01-01",
    "end":"2027-06-30",
    "option_window":{"start":"2026-09-01","end":"2026-10-30"},
    "cancellation_window":{"start":"2026-11-03","end":"2026-12-20"},
    "cancellation_deadline":"2026-12-20"
  },
  "second_semester":{
    "start":"2027-07-01",
    "end":"2027-12-31",
    "option_window":{"start":"2027-03-01","end":"2027-03-31"},
    "cancellation_window":{"start":"2026-11-03","end":"2026-12-20"},
    "cancellation_deadline":"2026-12-20"
  },
  "regular_ibs_cbs_rates":null,
  "normative_update":"Resolução CGSN nº 194/2026",
  "published_at":"2026-09-28",
  "note":"Do not calculate IBS/CBS regular rates from this rule; resolve the applicable normative tax rule separately."
}'::jsonb,
'2026-09-28','2027-12-31',true)
ON CONFLICT (tax_year,code,version) DO NOTHING;

ALTER TABLE tax_company_ibs_cbs_option_events
  ADD COLUMN IF NOT EXISTS cancellation_window_start DATE;

UPDATE tax_company_ibs_cbs_option_events
SET cancellation_window_start = cancellation_deadline
WHERE cancellation_window_start IS NULL;
