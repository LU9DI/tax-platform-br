# Spec Kit — Tax Platform BR

## Objetivo
Plataforma fiscal brasileira para empresas, com foco inicial em MEI e acompanhamento de receitas, pagamentos e obrigações.

## Estado atual
- Cadastro e gestão de empresas
- Dashboard fiscal por empresa
- Indicadores de faturamento, pagamentos e carga
- Visão de MEI/obrigações
- Analytics por período
- Drill-down e exportação CSV
- Ações rápidas no dashboard
- Autenticação, perfil, notificações e atividade
- Deploy de produção validado

## Critérios de qualidade
- Isolamento por usuário e empresa
- Validação de CNPJ, UF e valores monetários
- Separação entre dados declarados e cálculos
- Histórico auditável de lançamentos
- Nenhuma recomendação fiscal deve ser apresentada como garantia legal

## Próximas evoluções
1. Motor de regras tributárias versionado
2. Calendário de obrigações e alertas
3. Simulação de carga tributária
4. Exportação para contador
5. Testes automatizados dos cálculos e regras
