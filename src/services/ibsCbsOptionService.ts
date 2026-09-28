import { initDb } from "../core/db.js";
import type { PoolClient } from "pg";
import type { SimplesNationalIbsCbsOptionRule } from "./taxService.js";

type EventType = "elected" | "cancelled";

function dateOnly(value:string){const d=new Date(value+"T00:00:00Z");if(Number.isNaN(d.getTime()))throw new Error("invalid period");return d;}

function semesterDates(rule:SimplesNationalIbsCbsOptionRule,period:string){
 const d=dateOnly(period);
 const firstStart=dateOnly(rule.first_semester.start), firstEnd=dateOnly(rule.first_semester.end);
 const secondStart=dateOnly(rule.second_semester.start), secondEnd=dateOnly(rule.second_semester.end);
 if(d>=firstStart&&d<=firstEnd)return {semester:"first" as const,effectiveFrom:rule.first_semester.start,effectiveTo:rule.first_semester.end,window:rule.first_semester.option_window,cancellationDeadline:rule.first_semester.cancellation_deadline};
 if(d>=secondStart&&d<=secondEnd)return {semester:"second" as const,effectiveFrom:rule.second_semester.start,effectiveTo:rule.second_semester.end,window:rule.second_semester.option_window,cancellationDeadline:rule.second_semester.cancellation_deadline};
 throw new Error("period is outside the 2027 IBS/CBS option framework");
}

export async function getEffectiveIbsCbsOption(companyId:string,period:string,rule:SimplesNationalIbsCbsOptionRule){
 const db=initDb();
 const {semester,effectiveFrom,effectiveTo}=semesterDates(rule,period);
 const prior=semester==="second"
   ? await db.query("SELECT event_type,model,effective_from,effective_to,occurred_at,rule_version_id FROM tax_company_ibs_cbs_option_events WHERE company_id=$1 AND effective_from='2027-01-01' AND effective_to='2027-06-30' ORDER BY occurred_at DESC LIMIT 1",[companyId])
   : {rows:[] as any[]};
 const current=await db.query("SELECT event_type,model,effective_from,effective_to,occurred_at,rule_version_id FROM tax_company_ibs_cbs_option_events WHERE company_id=$1 AND effective_from=$2 AND effective_to=$3 ORDER BY occurred_at DESC",[companyId,effectiveFrom,effectiveTo]);
 const currentEvent=current.rows[0]??null;
 let model:"simples_puro"|"simples_hibrido"="simples_puro";
 let previousSemesterModel:"simples_puro"|"simples_hibrido"|undefined;
 if(semester==="second" && prior.rows[0]?.event_type==="elected") previousSemesterModel="simples_hibrido";
 if(currentEvent?.event_type==="elected") model="simples_hibrido";
 else if(currentEvent?.event_type==="cancelled") model="simples_puro";
 else if(previousSemesterModel==="simples_hibrido") model="simples_hibrido";
 return {model,previousSemesterModel,event:currentEvent};
}

export async function recordIbsCbsOptionEvent(input:{companyId:string;eventType:EventType;period:string;ruleVersionId:string}){
 const db=initDb();
 const ruleResult=await db.query("SELECT parameters FROM tax_rules WHERE id=$1 AND code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027'",[input.ruleVersionId]);
 if(!ruleResult.rowCount)throw new Error("IBS/CBS option rule not found");
 const rule=ruleResult.rows[0].parameters as SimplesNationalIbsCbsOptionRule;
 const {effectiveFrom,effectiveTo,window,cancellationDeadline}=semesterDates(rule,input.period);
 const now=new Date();
 const windowStart=dateOnly(window.start),windowEnd=dateOnly(window.end),deadline=dateOnly(cancellationDeadline);
 if(now<windowStart||now>deadline)throw new Error("IBS/CBS option event is outside the applicable option/cancellation window");
 if(input.eventType==="cancelled" && now>deadline)throw new Error("IBS/CBS cancellation deadline has passed");
 if(input.eventType==="elected" && now>windowEnd)throw new Error("IBS/CBS election window has closed");
 const id=crypto.randomUUID();
 await db.query("INSERT INTO tax_company_ibs_cbs_option_events (id,company_id,event_type,model,effective_from,effective_to,option_window_start,option_window_end,cancellation_deadline,rule_version_id) VALUES ($1,$2,$3,'simples_hibrido',$4,$5,$6,$7,$8,$9) ON CONFLICT (company_id,effective_from,effective_to,event_type) DO NOTHING",[id,input.companyId,input.eventType,effectiveFrom,effectiveTo,window.start,window.end,cancellationDeadline,input.ruleVersionId]);
 return id;
}
