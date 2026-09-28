INSERT INTO tax_rules
(id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to,active)
VALUES
('00000000-0000-4000-8000-000000000276',2027,'SIMPLES_NACIONAL_FATOR_R_ACTIVITY_CLASSIFICATION_2027','Simples Nacional 2027 - Classificação de atividades sujeitas ao Fator R','2027.1',
'https://normas.receita.fazenda.gov.br/sijut2consulta/consulta.action?orgaosSelecionados=CGSN&tipoData=2',
'Resolução CGSN nº 190/2026 e LC 123/2006; catálogo inicial fechado para 2027, sem inferência por texto.',
'{"classification_method":"explicit_identifier_only","fallback":"unknown","identifiers":[{"type":"CNAE","value":"6209-1/00","normalized":"6209100","activity_label":"Administração de banco de dados","classification":"factor_r_subject","legal_basis":["LC 123/2006, art. 18, § 5º-I, XII","LC 123/2006, art. 18, § 5º-J"],"source_reference":"Solução de Consulta COSIT nº 24/2025"}]}',
'2027-01-01','2027-12-31',true)
ON CONFLICT (tax_year,code,version) DO NOTHING;