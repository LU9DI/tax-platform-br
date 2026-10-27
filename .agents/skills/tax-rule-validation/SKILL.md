---
name: tax-rule-validation
description: Validate Brazilian tax-rule changes with traceable legal sources, effective dates, and regression evidence.
---

# Tax Rule Validation

Use this skill for IBS/CBS, tax calculations, fiscal events, rates, bases, credits, exemptions, and transition rules.

1. Identify the exact rule being implemented and cite the authoritative legal or official technical source; record article/section, version, publication date, and effective date where available.
2. Separate statutory requirements, official implementation guidance, product assumptions, and unresolved interpretation. Never invent a legal rule or present an assumption as settled law.
3. Trace inputs through normalization, calculation, persistence, and output. Preserve existing public contracts unless the change explicitly requires a versioned contract update.
4. Test positive, negative, boundary, missing, malformed, and date-effective cases. Include transition periods and interactions between IBS/CBS only when supported by the source.
5. Test decimal precision, rounding stage, currency/base units, and aggregation behavior explicitly. Avoid binary floating-point shortcuts for monetary amounts where the project uses decimal-safe representations.
6. Keep fixtures synthetic and deterministic. Do not put taxpayer identifiers, credentials, or production payloads into logs or tests.
7. Add regression tests for the reported bug and verify that unrelated tax paths remain unchanged.
8. If source interpretation or effective dates are uncertain, stop at a clearly documented blocker rather than silently choosing a value.
9. Report the exact commands and test results. Distinguish executed checks from planned or unavailable checks.
