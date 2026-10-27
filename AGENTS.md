# Agent guidance — Tax Platform BR

- Treat tax behavior as source-backed domain logic; distinguish legal requirements from implementation assumptions.
- Before changing IBS/CBS or other fiscal calculations, read `.agents/skills/tax-rule-validation/SKILL.md`.
- Preserve effective dates, calculation order, decimal precision, auditability, and existing API contracts.
- Add deterministic regression tests for positive, negative, boundary, malformed-input, and date-transition cases as applicable.
- Do not invent legal interpretations, taxpayer data, or test results. Document unresolved source ambiguity.
- Follow `.agents/skills/verification-gates/SKILL.md` for every code change.
- Do not run production migrations or deploy as part of validation unless explicitly requested.
