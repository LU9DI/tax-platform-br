import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { getEffectiveIbsCbsOption, recordIbsCbsOptionEvent } from "../src/services/ibsCbsOptionService.js";

const databaseUrl = process.env.TAX_TEST_DATABASE_URL;

// The option-event table is append-only by design (a DB trigger rejects DELETE), so
// tests must not clean up shared rows. Each test gets its own company instead.
async function createCompany(pool: pg.Pool): Promise<string> {
  const id = randomUUID();
  const cnpj = String(Math.floor(Math.random() * 1e14)).padStart(14, "0");
  await pool.query(
    "INSERT INTO tax_companies (id,user_id,legal_name,cnpj,regime) VALUES ($1,'00000000-0000-4000-8000-000000000001','IBS/CBS test company',$2,'simples')",
    [id, cnpj],
  );
  return id;
}

// Read the ledger as of an explicit instant. Relying on the wall clock makes tests
// time-dependent: events recorded with a future `now` are invisible until that date.
const at = (iso: string) => new Date(iso);

test(
  "IBS/CBS option state: pure default, hybrid election, cancellation, and second-semester continuity",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const companyId = await createCompany(pool);
      const ruleResult = await pool.query(
        "SELECT id, parameters FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1",
      );
      assert.equal(ruleResult.rowCount, 1);
      const rule = ruleResult.rows[0].parameters;
      const ruleVersionId = ruleResult.rows[0].id as string;
      assert.deepEqual(rule.second_semester.cancellation_window, { start: "2027-03-01", end: "2027-05-31" });
      assert.equal(rule.second_semester.cancellation_deadline, "2027-05-31");
      assert.deepEqual(rule.start_of_activity.ibs_cbs_cnpj_registration_window, { start: "2026-10-31", end: "2026-12-31" });
      assert.equal(rule.start_of_activity.effect_basis, "cnpj_registration_for_ibs_cbs");

      const before = await getEffectiveIbsCbsOption(companyId, "2027-01-15", rule, at("2026-09-01T00:00:00Z"));
      assert.equal(before.model, "simples_puro");

      await recordIbsCbsOptionEvent({
        companyId, eventType: "elected", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-09-15T12:00:00Z"),
      });
      const elected = await getEffectiveIbsCbsOption(companyId, "2027-01-15", rule, at("2026-09-16T00:00:00Z"));
      assert.equal(elected.model, "simples_hibrido");

      await recordIbsCbsOptionEvent({
        companyId, eventType: "cancelled", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-11-15T12:00:00Z"),
      });
      const cancelled = await getEffectiveIbsCbsOption(companyId, "2027-01-15", rule, at("2026-11-16T00:00:00Z"));
      assert.equal(cancelled.model, "simples_puro");

      const isolatedCompany = await createCompany(pool);
      {
        await recordIbsCbsOptionEvent({
          companyId: isolatedCompany, eventType: "elected", period: "2027-01-15", ruleVersionId,
          now: new Date("2026-09-15T12:00:00Z"),
        });
        const continued = await getEffectiveIbsCbsOption(isolatedCompany, "2027-07-15", rule, at("2027-07-16T00:00:00Z"));
        assert.equal(continued.model, "simples_hibrido");
        assert.equal(continued.previousSemesterModel, "simples_hibrido");
      }

      // First-semester option window (CGSN 194) closes on 2026-10-30.
      const lateCompany = await createCompany(pool);
      await assert.rejects(
        recordIbsCbsOptionEvent({
          companyId: lateCompany, eventType: "elected", period: "2027-01-15", ruleVersionId,
          now: new Date("2026-11-01T12:00:00Z"),
        }),
        /election window has closed/,
      );

      // Second-semester option window closes on 2027-03-31.
      await assert.rejects(
        recordIbsCbsOptionEvent({
          companyId: lateCompany, eventType: "elected", period: "2027-08-01", ruleVersionId,
          now: new Date("2027-04-01T12:00:00Z"),
        }),
        /election window has closed/,
      );

      // Re-sending the same election inside the window is an idempotent replay.
      const replayCompany = await createCompany(pool);
      const first = await recordIbsCbsOptionEvent({
        companyId: replayCompany, eventType: "elected", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-10-01T12:00:00Z"),
      });
      assert.equal(
        await recordIbsCbsOptionEvent({
          companyId: replayCompany, eventType: "elected", period: "2027-01-15", ruleVersionId,
          now: new Date("2026-10-02T12:00:00Z"),
        }),
        first,
      );
    } finally {
      await pool.end();
    }
  },
);


test(
  "IBS/CBS cancellation requires an active hybrid option",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const companyId = await createCompany(pool);
      const ruleResult = await pool.query("SELECT id FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1");
      assert.equal(ruleResult.rowCount, 1);
      const ruleVersionId = ruleResult.rows[0].id as string;
      await assert.rejects(
        recordIbsCbsOptionEvent({
          companyId, eventType: "cancelled", period: "2027-01-15", ruleVersionId,
          now: new Date("2026-11-15T12:00:00Z"),
        }),
        /cancellation requires an active hybrid option/,
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
      const companyId = await createCompany(pool);
      const ruleResult = await pool.query("SELECT id FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1");
      assert.equal(ruleResult.rowCount, 1);
      const ruleVersionId = ruleResult.rows[0].id as string;
      await recordIbsCbsOptionEvent({
        companyId, eventType: "elected", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-09-15T12:00:00Z"),
      });
      await assert.rejects(
        recordIbsCbsOptionEvent({
          companyId, eventType: "cancelled", period: "2027-01-15", ruleVersionId,
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
      const companyId = await createCompany(pool);
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
      const state = await getEffectiveIbsCbsOption(companyId, "2027-08-01", rule, at("2027-03-16T00:00:00Z"));
      assert.equal(state.model, "simples_puro");
    } finally {
      await pool.end();
    }
  },
);


test(
  "IBS/CBS second-semester election is rejected when first-semester hybrid remains active",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const companyId = await createCompany(pool);
      const ruleResult = await pool.query("SELECT id FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1");
      assert.equal(ruleResult.rowCount, 1);
      const ruleVersionId = ruleResult.rows[0].id as string;
      await recordIbsCbsOptionEvent({ companyId, eventType: "elected", period: "2027-01-15", ruleVersionId, now: new Date("2026-09-15T12:00:00Z") });
      await assert.rejects(
        recordIbsCbsOptionEvent({ companyId, eventType: "elected", period: "2027-07-15", ruleVersionId, now: new Date("2027-03-15T12:00:00Z") }),
        /first-semester hybrid option remains active/,
      );
    } finally {
      await pool.end();
    }
  },
);


test(
  "IBS/CBS second-semester election is allowed when there was no first-semester election",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const companyId = await createCompany(pool);
      const ruleResult = await pool.query("SELECT id, parameters FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1");
      assert.equal(ruleResult.rowCount, 1);
      const rule = ruleResult.rows[0].parameters;
      const ruleVersionId = ruleResult.rows[0].id as string;

      await recordIbsCbsOptionEvent({
        companyId, eventType: "elected", period: "2027-07-15", ruleVersionId,
        now: new Date("2027-03-15T12:00:00Z"),
      });
      const state = await getEffectiveIbsCbsOption(companyId, "2027-07-15", rule, at("2027-03-16T00:00:00Z"));
      assert.equal(state.model, "simples_hibrido");
      assert.equal(state.previousSemesterModel, "simples_puro");
    } finally {
      await pool.end();
    }
  },
);


test(
  "IBS/CBS second-semester election is allowed after first-semester cancellation",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const companyId = await createCompany(pool);
      const ruleResult = await pool.query("SELECT id, parameters FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1");
      assert.equal(ruleResult.rowCount, 1);
      const rule = ruleResult.rows[0].parameters;
      const ruleVersionId = ruleResult.rows[0].id as string;

      await recordIbsCbsOptionEvent({
        companyId, eventType: "elected", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-09-15T12:00:00Z"),
      });
      await recordIbsCbsOptionEvent({
        companyId, eventType: "cancelled", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-11-15T12:00:00Z"),
      });

      const afterCancellation = await getEffectiveIbsCbsOption(companyId, "2027-07-15", rule, at("2026-11-16T00:00:00Z"));
      assert.equal(afterCancellation.model, "simples_puro");

      await recordIbsCbsOptionEvent({
        companyId, eventType: "elected", period: "2027-07-15", ruleVersionId,
        now: new Date("2027-03-15T12:00:00Z"),
      });
      const reElected = await getEffectiveIbsCbsOption(companyId, "2027-07-15", rule, at("2027-03-16T00:00:00Z"));
      assert.equal(reElected.model, "simples_hibrido");
    } finally {
      await pool.end();
    }
  },
);


test(
  "IBS/CBS option event persistence is idempotent and returns the persisted event id",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const companyId = await createCompany(pool);
      const ruleResult = await pool.query("SELECT id FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1");
      assert.equal(ruleResult.rowCount, 1);
      const ruleVersionId = ruleResult.rows[0].id as string;

      const firstId = await recordIbsCbsOptionEvent({
        companyId, eventType: "elected", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-09-15T12:00:00Z"),
      });
      const secondId = await recordIbsCbsOptionEvent({
        companyId, eventType: "elected", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-09-15T12:00:00Z"),
      });

      assert.equal(secondId, firstId);
      const count = await pool.query(
        "SELECT count(*)::int AS count FROM tax_company_ibs_cbs_option_events WHERE company_id=$1 AND effective_from='2027-01-01' AND effective_to='2027-06-30' AND event_type='elected'",
        [companyId],
      );
      assert.equal(count.rows[0].count, 1);
    } finally {
      await pool.end();
    }
  },
);


test(
  "IBS/CBS second-semester election or renunciation can be cancelled through 31 May 2027",
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      const companyId = await createCompany(pool);
      const ruleResult = await pool.query("SELECT id, parameters FROM tax_rules WHERE code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027' AND active=true ORDER BY version DESC LIMIT 1");
      assert.equal(ruleResult.rowCount, 1);
      const rule = ruleResult.rows[0].parameters;
      const ruleVersionId = ruleResult.rows[0].id as string;

      await recordIbsCbsOptionEvent({
        companyId, eventType: "elected", period: "2027-07-15", ruleVersionId,
        now: new Date("2027-03-15T12:00:00Z"),
      });
      await recordIbsCbsOptionEvent({
        companyId, eventType: "cancelled", period: "2027-07-15", ruleVersionId,
        now: new Date("2027-05-31T12:00:00Z"),
      });
      const cancelledElection = await getEffectiveIbsCbsOption(companyId, "2027-07-15", rule, at("2027-06-01T00:00:00Z"));
      assert.equal(cancelledElection.model, "simples_puro");

      const renunciationCompany = await createCompany(pool);
      await recordIbsCbsOptionEvent({
        companyId: renunciationCompany, eventType: "elected", period: "2027-01-15", ruleVersionId,
        now: new Date("2026-09-15T12:00:00Z"),
      });
      await recordIbsCbsOptionEvent({
        companyId: renunciationCompany, eventType: "renounced", period: "2027-07-15", ruleVersionId,
        now: new Date("2027-03-15T12:00:00Z"),
      });
      await recordIbsCbsOptionEvent({
        companyId: renunciationCompany, eventType: "cancelled", period: "2027-07-15", ruleVersionId,
        now: new Date("2027-05-31T12:00:00Z"),
      });
      const cancelledRenunciation = await getEffectiveIbsCbsOption(renunciationCompany, "2027-07-15", rule, at("2027-06-01T00:00:00Z"));
      assert.equal(cancelledRenunciation.model, "simples_hibrido");
    } finally {
      await pool.end();
    }
  },
);
