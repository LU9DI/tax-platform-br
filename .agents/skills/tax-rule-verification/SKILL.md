---
name: tax-rule-verification
description: Implement and test Brazilian tax rules with traceable sources, dates, and reproducible calculations.
---
# Tax rule verification
- Treat tax rules as effective-dated domain data, not unexplained constants scattered through business logic.
- Record authoritative source, jurisdiction, effective start/end date, applicable taxpayer profile, and version for each rule.
- Separate calculation mechanics from rule selection; make rounding, thresholds, exemptions, and precedence explicit.
- Never invent a tax rate or claim legal certainty without a traceable source and review date.
- Use golden test vectors for boundary values, date transitions, exemptions, rounding, and combined rules.
- Keep representative test fixtures synthetic and avoid logging taxpayer identifiers or financial data.
- When source interpretation is ambiguous, preserve the ambiguity and require domain/legal review instead of silently choosing.
- Ensure historical calculations can be reproduced with the rule version effective at the time.
