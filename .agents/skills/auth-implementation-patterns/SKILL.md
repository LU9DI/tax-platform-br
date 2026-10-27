---
name: auth-implementation-patterns
description: Review JWT authentication, taxpayer/account ownership, and privacy boundaries.
---
# Authentication and authorization
- Verify JWT signature and expiry; validate issuer/audience where configured.
- Enforce object-level access for taxpayer, accountant, organization, document, and calculation records.
- Never trust taxpayer or organization IDs supplied only in request data.
- Keep credentials in environment/secret storage and redact tax IDs, financial details, tokens, and personal data from logs.
- Fail closed on invalid auth configuration and keep tenant boundaries explicit in database queries.
- Test cross-user/cross-organization access, expired tokens, role changes, and revoked credentials.
