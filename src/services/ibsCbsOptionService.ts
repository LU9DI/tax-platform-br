import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import type { SimplesNationalIbsCbsOptionRule } from "./taxService.js";

type EventType = "elected" | "cancelled" | "renounced";
type Model = "simples_puro" | "simples_hibrido";

function dateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("invalid date");
  const d = new Date(value + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error("invalid date");
  return d;
}

function brazilDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function assertDateInWindow(now: Date, start: string, end: string, error: string) {
  const current = brazilDate(now);
  if (current < start || current > end) throw new Error(error);
}

function semesterDates(rule: SimplesNationalIbsCbsOptionRule, period: string) {
  const d = dateOnly(period);
  const firstStart = dateOnly(rule.first_semester.start);
  const firstEnd = dateOnly(rule.first_semester.end);
  const secondStart = rule.second_semester ? dateOnly(rule.second_semester.start) : null;
  const secondEnd = rule.second_semester ? dateOnly(rule.second_semester.end) : null;

  if (d >= firstStart && d <= firstEnd) {
    return {
      semester: "first" as const,
      effectiveFrom: rule.first_semester.start,
      effectiveTo: rule.first_semester.end,
      window: rule.first_semester.option_window,
      cancellationDeadline: rule.first_semester.cancellation_deadline ?? null,
      cancellationWindow:
        rule.first_semester.cancellation_window ??
        (rule.first_semester.cancellation_deadline
          ? { start: rule.first_semester.option_window.start, end: rule.first_semester.cancellation_deadline }
          : undefined),
      renunciationWindow: undefined,
    };
  }

  if (secondStart && secondEnd && d >= secondStart && d <= secondEnd) {
    return {
      semester: "second" as const,
      effectiveFrom: rule.second_semester!.start,
      effectiveTo: rule.second_semester!.end,
      window: rule.second_semester!.option_window,
      cancellationDeadline: rule.second_semester!.cancellation_deadline ?? null,
      cancellationWindow: rule.second_semester!.cancellation_window,
      renunciationWindow: rule.second_semester!.renunciation_window,
    };
  }

  throw new Error("period is outside the 2027 IBS/CBS option framework");
}

type EventRow = {
  id: string;
  event_type: EventType;
  model: Model;
  effective_from: string;
  effective_to: string;
  occurred_at: string;
  rule_version_id: string;
};

async function eventHistory(
  db: any,
  companyId: string,
  effectiveFrom: string,
  effectiveTo: string,
  asOf: Date,
) {
  const result = await db.query(
    `SELECT id,event_type,model,effective_from,effective_to,occurred_at,rule_version_id
     FROM tax_company_ibs_cbs_option_events
     WHERE company_id=$1
       AND effective_from=$2
       AND effective_to=$3
       AND occurred_at <= $4
     ORDER BY occurred_at ASC, id ASC`,
    [companyId, effectiveFrom, effectiveTo, asOf],
  );
  return result.rows as EventRow[];
}

function deriveSemesterState(history: EventRow[]) {
  let model: Model = "simples_puro";
  let terminal = false;

  for (const event of history) {
    if (terminal) {
      throw new Error("IBS/CBS option event history contains an impossible transition");
    }

    if (event.event_type === "elected") {
      if (model !== "simples_puro") {
        throw new Error("IBS/CBS option history contains a repeated election");
      }
      model = "simples_hibrido";
      continue;
    }

    if (event.event_type === "renounced") {
      if (model !== "simples_hibrido") {
        throw new Error("IBS/CBS renunciation requires an active hybrid option");
      }
      model = "simples_puro";
      continue;
    }

    if (event.event_type === "cancelled") {
      if (model !== "simples_hibrido" && model !== "simples_puro") {
        throw new Error("IBS/CBS cancellation has an invalid state");
      }
      terminal = true;
      continue;
    }

    throw new Error("IBS/CBS option history contains an unknown event");
  }

  return { model, terminal };
}

export async function getEffectiveIbsCbsOption(
  companyId: string,
  period: string,
  rule: SimplesNationalIbsCbsOptionRule,
  asOf?: Date,
) {
  const db = initDb();
  const { semester, effectiveFrom, effectiveTo } = semesterDates(rule, period);
  const decisionAt = asOf ?? new Date();

  const priorHistory =
    semester === "second"
      ? await eventHistory(db, companyId, "2027-01-01", "2027-06-30", decisionAt)
      : [];
  const currentHistory = await eventHistory(db, companyId, effectiveFrom, effectiveTo, decisionAt);

  const priorState = priorHistory.length ? deriveSemesterState(priorHistory) : { model: "simples_puro" as Model, terminal: false };
  const currentState = currentHistory.length ? deriveSemesterState(currentHistory) : { model: "simples_puro" as Model, terminal: false };

  const previousSemesterModel =
    semester === "second" && priorState.model === "simples_hibrido"
      ? ("simples_hibrido" as const)
      : semester === "second"
        ? ("simples_puro" as const)
        : undefined;

  let model: Model = currentState.model;
  if (semester === "second" && !currentHistory.length) {
    model = previousSemesterModel === "simples_hibrido" ? "simples_hibrido" : "simples_puro";
  }
  if (semester === "second" && currentState.terminal && currentHistory.at(-1)?.event_type === "cancelled") {
    model = previousSemesterModel === "simples_hibrido" ? "simples_hibrido" : "simples_puro";
  }

  return {
    model,
    previousSemesterModel,
    event: currentHistory.at(-1) ?? null,
    asOf: decisionAt.toISOString(),
  };
}

export async function recordIbsCbsOptionEvent(input: {
  companyId: string;
  eventType: EventType;
  period: string;
  ruleVersionId: string;
  now?: Date;
}) {
  const db = initDb();
  const ruleResult = await db.query(
    "SELECT parameters FROM tax_rules WHERE id=$1 AND code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027'",
    [input.ruleVersionId],
  );
  if (!ruleResult.rowCount) throw new Error("IBS/CBS option rule not found");

  const rule = ruleResult.rows[0].parameters as SimplesNationalIbsCbsOptionRule;
  const {
    semester,
    effectiveFrom,
    effectiveTo,
    window,
    cancellationDeadline,
    cancellationWindow,
    renunciationWindow,
  } = semesterDates(rule, input.period);

  const now = input.now ?? new Date();
  const history = await eventHistory(db, input.companyId, effectiveFrom, effectiveTo, now);
  const state = history.length ? deriveSemesterState(history) : { model: "simples_puro" as Model, terminal: false };

  if (state.terminal) {
    throw new Error("IBS/CBS option cycle is already terminal");
  }

  if (input.eventType === "elected") {
    if (history.length) throw new Error("IBS/CBS option cycle already has a decision");
    if (semester === "second") {
      const prior = await eventHistory(db, input.companyId, "2027-01-01", "2027-06-30", now);
      const priorState = prior.length ? deriveSemesterState(prior) : { model: "simples_puro" as Model, terminal: false };
      if (priorState.model === "simples_hibrido") {
        throw new Error("second-semester election is unavailable while first-semester hybrid option remains active");
      }
    }
    assertDateInWindow(now, window.start, window.end, "IBS/CBS election window has closed");
  } else if (input.eventType === "cancelled") {
    if (!cancellationWindow) throw new Error("IBS/CBS cancellation is not available for this semester");
    if (semester === "first" && state.model !== "simples_hibrido") {
      throw new Error("IBS/CBS cancellation requires an active hybrid option");
    }
    if (semester === "second" && state.model !== "simples_hibrido" && history.at(-1)?.event_type !== "renounced") {
      throw new Error("IBS/CBS second-semester cancellation requires an active hybrid option or an explicit renunciation");
    }
    assertDateInWindow(now, cancellationWindow.start, cancellationWindow.end, "IBS/CBS cancellation window is closed");
    if (cancellationDeadline && brazilDate(now) > cancellationDeadline) {
      throw new Error("IBS/CBS cancellation deadline has passed");
    }
  } else {
    if (semester !== "second" || !renunciationWindow) {
      throw new Error("IBS/CBS renunciation window is not available");
    }
    if (history.length) throw new Error("IBS/CBS second-semester option cycle already has a decision");
    const prior = await eventHistory(db, input.companyId, "2027-01-01", "2027-06-30", now);
    const priorState = prior.length ? deriveSemesterState(prior) : { model: "simples_puro" as Model, terminal: false };
    if (priorState.model !== "simples_hibrido") {
      throw new Error("IBS/CBS renunciation requires an active first-semester hybrid option");
    }
    assertDateInWindow(now, renunciationWindow.start, renunciationWindow.end, "IBS/CBS renunciation window is closed");
  }

  const id = randomUUID();
  const inserted = await db.query(
    `INSERT INTO tax_company_ibs_cbs_option_events
      (id,company_id,event_type,model,effective_from,effective_to,
       option_window_start,option_window_end,cancellation_window_start,
       renunciation_window_start,renunciation_window_end,cancellation_deadline,
       rule_version_id,occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (company_id,effective_from,effective_to,event_type) DO NOTHING
     RETURNING id`,
    [
      id,
      input.companyId,
      input.eventType,
      input.eventType === "elected" ? "simples_hibrido" : "simples_puro",
      effectiveFrom,
      effectiveTo,
      window.start,
      window.end,
      cancellationWindow?.start ?? null,
      renunciationWindow?.start ?? null,
      renunciationWindow?.end ?? null,
      cancellationDeadline ?? null,
      input.ruleVersionId,
      now,
    ],
  );

  if (inserted.rowCount) return inserted.rows[0].id as string;

  const existing = await db.query(
    "SELECT id FROM tax_company_ibs_cbs_option_events WHERE company_id=$1 AND effective_from=$2 AND effective_to=$3 AND event_type=$4 LIMIT 1",
    [input.companyId, effectiveFrom, effectiveTo, input.eventType],
  );
  if (!existing.rowCount) throw new Error("IBS/CBS option event could not be persisted");
  return existing.rows[0].id as string;
}
