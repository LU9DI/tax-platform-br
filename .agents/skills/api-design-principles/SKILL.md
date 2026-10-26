---
name: api-design-principles
description: Design stable API contracts for tax-platform-br.
---
# API design principles
- Follow established Express route, validation, response, and error conventions.
- Validate and bound all untrusted input at the API boundary.
- Keep authentication, authorization, validation, tax domain logic, and persistence distinct.
- Return structured errors without stack traces, tax identifiers, secrets, or unnecessary personal data.
- Make mutating operations idempotent where retries are possible and use transactions for multi-step state changes.
- Test unauthorized, forbidden, malformed, boundary-value, duplicate, and success cases.
