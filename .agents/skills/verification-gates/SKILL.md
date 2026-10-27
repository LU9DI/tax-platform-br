---
name: verification-gates
description: Require reproducible acceptance criteria and honest validation reports for code changes.
---

# Verification Gates

1. Define observable acceptance criteria before changing code.
2. Inspect repository instructions, the owning implementation, and relevant tests first.
3. Make the smallest coherent change; preserve contracts and unrelated work.
4. Add regression tests for changed behavior and failure paths.
5. Run targeted checks, then the repository's required broader checks when practical.
6. Report passed, failed, skipped, and not-run checks separately, with commands and relevant run/commit identifiers.
7. Never disable tests, weaken assertions, or hide errors to obtain a green result.
8. Do not infer production readiness from a successful dependency audit or a single test job.
9. Do not deploy, migrate production data, or trigger external side effects as part of a code-only change without explicit authorization.
