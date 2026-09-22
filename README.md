# Tax Platform BR

Plataforma tributária brasileira para pessoas físicas e contadores, preparada para regras e serviços fiscais.

## Arquitetura
- Repositório independente
- Backend Node.js + TypeScript + Express
- PostgreSQL próprio
- JWT com rotação de segredos
- Segurança, métricas e retry desacoplados do domínio
- Frontend e deployment próprios

## Isolamento
Não depende do runtime, banco, domínio ou regras do Filtra.AI. A fundação genérica é independente.
