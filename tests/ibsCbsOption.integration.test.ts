import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { getEffectiveIbsCbsOption, recordIbsCbsOptionEvent } from "../src/services/ibsCbsOptionService.js";

const databaseUrl = process.env.TAX_TEST_DATABASE_URL;

test(
  "IBS/CBS option state: pure default, hybrid election, cancellation, and second-semester continuity",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const seed = await pool.query("SELECT id FROM tax_companies LIMIT 1");
      assert.equal(seed.rowCount, 1);
      const companyId = seed.rows[0].id as string;
      const ruleResult = await pool.query(
        "SELECT id, parameters FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1",
      );
      assert.equal(ruleResult.rowCount, 1);
      const rule = ruleResult.rows[0].parameters;
      const ruleVersionId = ruleResult.rows[0].id as string;

      const before = await getEffectiveIbsCbsOption(companyId, "2027-01-15", rule);
      assert.equal(before.model, "simples_puro");

      await recordIbsCbsOptionEvent({
        companyId, eventType: "elected", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-09-15T12:00:00Z"),
      });
      const elected = await getEffectiveIbsCbsOption(companyId, "2027-01-15", rule);
      assert.equal(elected.model, "simples_hibrido");

      await recordIbsCbsOptionEvent({
        companyId, eventType: "cancelled", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-11-15T12:00:00Z"),
      });
      const cancelled = await getEffectiveIbsCbsOption(companyId, "2027-01-15", rule);
      assert.equal(cancelled.model, "simples_puro");

      const isolatedCompany = (await pool.query(
        "SELECT id FROM tax_companies WHERE id <> $1 LIMIT 1", [companyId],
      )).rows[0]?.id as string | undefined;
      if (isolatedCompany) {
        await recordIbsCbsOptionEvent({
          companyId: isolatedCompany, eventType: "elected", period: "2027-01-15", ruleVersionId,
          now: new Date("2026-09-15T12:00:00Z"),
        });
        const continued = await getEffectiveIbsCbsOption(isolatedCompany, "2027-07-15", rule);
        assert.equal(continued.model, "simples_hibrido");
        assert.equal(continued.previousSemesterModel, "simples_hibrido");
      }

      await assert.rejects(
        recordIbsCbsOptionEvent({
          companyId, eventType: "elected", period: "2027-01-15", ruleVersionId,
          now: new Date("2026-10-01T12:00:00Z"),
        }),
        /election window has closed/,
      );

      await assert.rejects(
        recordIbsCbsOptionEvent({
          companyId, eventType: "elected", period: "2027-08-01", ruleVersionId,
          now: new Date("2027-04-01T12:00:00Z"),
        }),
        /election window has closed/,
      );
    } finally {
      await pool.end();
    }
  },
);


test(
  "IBS/CBS cancellation cannot happen before the CGSN 194 cancellation window",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const seed = await pool.query("SELECT id FROM tax_companies LIMIT 1");
      assert.equal(seed.rowCount, 1);
      const companyId = seed.rows[0].id as string;
      const ruleResult = await pool.query("SELECT id FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1");
      assert.equal(ruleResult.rowCount, 1);
      await assert.rejects(
        recordIbsCbsOptionEvent({
          companyId, eventType: "cancelled", period: "2027-01-15", ruleVersionId: ruleResult.rows[0].id as string,
          now: new Date("2026-11-02T12:00:00Z"),
        }),
        /cancellation window is closed/,
      );
    } finally {
      await pool.end();
    }
  },
);


test(
  "IBS/CBS second-semester renunciation is distinct from 2026 cancellation",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const seed = await pool.query("SELECT id FROM tax_companies LIMIT 1");
      assert.equal(seed.rowCount, 1);
      const companyId = seed.rows[0].id as string;
      const ruleResult = await pool.query("SELECT id, parameters FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1");
      assert.equal(ruleResult.rowCount, 1);
      const rule = ruleResult.rows[0].parameters;
      const ruleVersionId = ruleResult.rows[0].id as string;

      await recordIbsCbsOptionEvent({
        companyId, eventType: "elected", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-09-15T12:00:00Z"),
      });

      await assert.rejects(
        recordIbsCbsOptionEvent({
          companyId, eventType: "renounced", period: "2027-08-01", ruleVersionId,
          now: new Date("2027-02-28T12:00:00Z"),
        }),
        /renunciation window is closed/,
      );

      await recordIbsCbsOptionEvent({
        companyId, eventType: "renounced", period: "2027-08-01", ruleVersionId,
        now: new Date("2027-03-15T12:00:00Z"),
      });
      const state = await getEffectiveIbsCbsOption(companyId, "2027-08-01", rule);
      assert.equal(state.model, "simples_puro");
    } finally {
      await pool.end();
    }
  },
);
