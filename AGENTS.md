# Agent guidance — tax-platform-br

Independent Node.js/TypeScript/Express and PostgreSQL platform for Brazilian tax workflows.

## Skill routing
- HTTP endpoints and response contracts: read .agents/skills/api-design-principles/SKILL.md.
- JWT, taxpayer/accountant access, organizations, or personal data: read .agents/skills/auth-implementation-patterns/SKILL.md.
- Tax calculations, rates, thresholds, exemptions, effective dates, or source interpretation: read .agents/skills/tax-rule-verification/SKILL.md.

## Validation
Run npm ci, npm run check, and npm test for relevant changes. Use synthetic taxpayer data; do not state that calculations are legally validated without source traceability and domain review.
