-- Versioned activity classification gate for Fator R.
-- Conservative by design: only explicitly evidenced identifiers may be classified.
-- Unknown identifiers MUST NOT be inferred from free-text descriptions.
-- Evidence: RFB Solucao de Consulta COSIT 24/2025 (CNAE 6209-1/00),
-- which places database administration under LC 123/2006 art. 18, §5º-I, XII
-- and subjects it to Anexo III/V according to Fator R.
INSERT INTO tax_rules
  (id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
(
  '00000000-0000-4000-8000-000000000268',
  2026,
  'SIMPLES_NACIONAL_FATOR_R_ACTIVITY_CLASSIFICATION_2026',
  'Simples Nacional 2026 - Classificação de atividades sujeitas ao Fator R',
  '2026.1',
  'https://normas.receita.fazenda.gov.br/sijut2consulta/normas.receita.fazenda.gov.br/sijut2consulta/anexoOutros.action?idArquivoBinario=78278',
  'Solução de Consulta COSIT nº 24, de 11/03/2025; LC 123/2006, art. 18, §§ 5º-I, 5º-J, 5º-K e 5º-M. Catálogo inicial fechado; ausência de identificador no catálogo resulta em classificação unknown.',
  '{"classification_method":"explicit_identifier_only","fallback":"unknown","identifiers":[{"type":"CNAE","value":"6209-1/00","normalized":"6209100","activity_label":"Administração de banco de dados","classification":"factor_r_subject","legal_basis":["LC 123/2006, art. 18, § 5º-I, XII","LC 123/2006, art. 18, § 5º-J"],"source_reference":"Solução de Consulta COSIT nº 24/2025","evidence":"A RFB enquadrou a administração de banco de dados como atividade intelectual de natureza técnica sujeita ao Anexo III quando fator R >= 0,28 e Anexo V quando fator R < 0,28."}]}',
  '2026-01-01','2026-12-31',true
)
ON CONFLICT (tax_year,code,version) DO NOTHING;
