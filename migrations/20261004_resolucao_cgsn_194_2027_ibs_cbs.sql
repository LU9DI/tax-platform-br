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
    "renunciation_window":{"start":"2027-03-01","end":"2027-03-31"},
    "cancellation_deadline":null
  },
  "start_of_activity":{
    "cnpj_registration_window":{"start":"2026-10-31","end":"2026-12-31"},
    "option_at_cnpj_registration":true,
    "ibs_cbs_effective_window":{"start":"2027-01-01","end":"2027-06-30"},
    "effect_basis":"cnpj_registration_for_simples_and_ibs_cbs"
  },
  "regular_ibs_cbs_rates":null,
  "normative_update":"Resolução CGSN nº 194/2026",
  "published_at":"2026-09-28",
  "note":"The CGSN 194 update governs the Jan-Jun 2027 choice and the 2026 deadlines; the Jul-Dec framework is retained from the prior normative versions and must not be inferred from CGSN 194 alone."
}'::jsonb,
'2026-09-28','2027-12-31',true)
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

ALTER TABLE tax_company_ibs_cbs_option_events
  ADD COLUMN IF NOT EXISTS cancellation_window_start DATE;

ALTER TABLE tax_company_ibs_cbs_option_events
  ADD COLUMN IF NOT EXISTS renunciation_window_start DATE;

ALTER TABLE tax_company_ibs_cbs_option_events
  ADD COLUMN IF NOT EXISTS renunciation_window_end DATE;
