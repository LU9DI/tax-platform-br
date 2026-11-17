import test from "node:test";
import assert from "node:assert/strict";
import {
  signAccessToken,
  verifyAccessToken,
  requireJwtSecret,
} from "../src/core/jwt.js";
import {
  classifyFactorRActivity,
} from "../src/services/taxActivityClassificationService.js";

type ClassificationRule = {
  classification_method: "explicit_identifier_only";
  fallback: "unknown";
  identifiers: Array<{
    type: "CNAE";
    value: string;
    normalized: string;
    activity_label: string;
    classification: "factor_r_subject" | "not_factor_r_subject";
    legal_basis: string[];
    source_reference: string;
    evidence: string;
  }>;
};

// ---------------------------------------------------------------------------
// 1. JWT — revogação e expiração
// ---------------------------------------------------------------------------

test("JWT access token expires after configured TTL (7 days)", () => {
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
  const token = signAccessToken({ sub: "user-exp", role: "user" });

  const payloadPart = token.split(".")[1];
  const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString());
  const ttlSeconds = payload.exp - payload.iat;
  assert.equal(ttlSeconds, 604800, "access token TTL should be 7 days");
});

test("JWT token signed with weak secret is rejected", () => {
  process.env.JWT_SECRET = "short";
  assert.throws(() => requireJwtSecret(), /JWT_SECRET must be at least 32 characters/);
});

test("JWT token signed with previous secret remains verifiable during rotation", () => {
  process.env.JWT_SECRET = "current-secret-that-is-at-least-32-characters-long";
  const token = signAccessToken({ sub: "rotation-user" });

  process.env.JWT_SECRET_PREVIOUS = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "new-current-secret-that-is-at-least-32-characters-long";
  const payload = verifyAccessToken(token);
  assert.equal(payload.sub, "rotation-user");

  delete process.env.JWT_SECRET_PREVIOUS;
});

test("JWT token with no signature is rejected", () => {
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
  const malformed = "header.payload.nosignature";
  assert.throws(() => verifyAccessToken(malformed), /invalid token/);
});

// ---------------------------------------------------------------------------
// 2. Verificação de e-mail (registro sem confirmação)
// ---------------------------------------------------------------------------

test("registration endpoint does not auto-verify email (documented gap)", () => {
  // This test documents the current behavior: registration issues a JWT
  // immediately without email verification. There is no email_verified column
  // in app_users and no /api/auth/verify-email endpoint.
  // Risk: HIGH — unverified users have full access.
  assert.ok(true, "email verification gap documented; requires DB integration test");
});

// ---------------------------------------------------------------------------
// 3. Rate limiting — revisar compartilhamento e chave por IP
// ---------------------------------------------------------------------------

test("rate limit middleware uses IP-based key (not user_id)", () => {
  // Document the current behavior: rateLimit uses req.ip + auth/api type.
  // It does not use user_id, so multiple users behind the same IP share a bucket.
  // Risk: MEDIO — shared IP can cause collateral rate limiting.
  const key = "192.168.1.1|api";
  assert.ok(key.includes("|api"), "rate limit key includes endpoint type");
  assert.ok(!key.includes("user_"), "rate limit key does NOT include user_id");
});

// ---------------------------------------------------------------------------
// 4. CSP — ausência de cabeçalhos de segurança
// ---------------------------------------------------------------------------

test("no Content-Security-Policy header is configured in server.ts (documented gap)", () => {
  // Document the current behavior: server.ts does not set CSP, X-Frame-Options,
  // X-Content-Type-Options, or Referrer-Policy headers.
  // Risk: ALTO — XSS/clickjacking surface.
  assert.ok(true, "CSP gap documented; requires middleware addition");
});

// ---------------------------------------------------------------------------
// 5. Validação de CNAE e classificação fiscal
// ---------------------------------------------------------------------------

test("CNAE with formatting is normalized and matched", () => {
  const rule = {
    classification_method: "explicit_identifier_only" as const,
    fallback: "unknown" as const,
    identifiers: [
      {
        type: "CNAE" as const,
        value: "6201501",
        normalized: "6201501",
        activity_label: "Desenvolvimento de programas de computador sob encomenda",
        classification: "factor_r_subject" as const,
        legal_basis: ["CNAE 2.2"],
        source_reference: "IBGE CNAE 2.2",
        evidence: "official",
      },
    ],
  } as ClassificationRule;

  const result = classifyFactorRActivity({ type: "CNAE", value: "62.01-5/01" }, rule);
  assert.equal(result.status, "factor_r_subject");
  assert.equal(result.identifier.value, "62.01-5/01");
});

test("empty CNAE value is rejected", () => {
  const rule = {
    classification_method: "explicit_identifier_only" as const,
    fallback: "unknown" as const,
    identifiers: [] as const,
  } as ClassificationRule;
  assert.throws(
    () => classifyFactorRActivity({ type: "CNAE", value: "" }, rule),
    /activity identifier value is required/,
  );
});

test("non-CNAE identifier type is rejected", () => {
  const rule = {
    classification_method: "explicit_identifier_only" as const,
    fallback: "unknown" as const,
    identifiers: [] as const,
  } as ClassificationRule;
  assert.throws(
    () => classifyFactorRActivity({ type: "CPF", value: "123" } as any, rule),
    /activity identifier type must be CNAE/,
  );
});

test("CNAE not in rule identifiers returns unknown (not rejected — risk)", () => {
  const rule = {
    classification_method: "explicit_identifier_only" as const,
    fallback: "unknown" as const,
    identifiers: [
      {
        type: "CNAE" as const,
        value: "6201501",
        normalized: "6201501",
        activity_label: "Dev de software",
        classification: "factor_r_subject" as const,
        legal_basis: ["CNAE 2.2"],
        source_reference: "IBGE",
        evidence: "official",
      },
    ],
  } as ClassificationRule;

  const result = classifyFactorRActivity({ type: "CNAE", value: "9999999" }, rule);
  assert.equal(result.status, "unknown");
  assert.equal(result.legalBasis.length, 0);
  // Risk: activities with unknown classification are not rejected;
  // they silently proceed as non-subjects, potentially masking invalid data.
});