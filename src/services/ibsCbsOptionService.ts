import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import type { SimplesNationalIbsCbsOptionRule } from "./taxService.js";

type EventType = "elected" | "cancelled" | "renounced";

function dateOnly(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("invalid date");const d=new Date(value+"T00:00:00Z");if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error("invalid date");return d;}

function semesterDates(rule:SimplesNationalIbsCbsOptionRule,period:string){
 const d=dateOnly(period);
 const firstStart=dateOnly(rule.first_semester.start), firstEnd=dateOnly(rule.first_semester.end);
 const secondStart=rule.second_semester ? dateOnly(rule.second_semester.start) : null, secondEnd=rule.second_semester ? dateOnly(rule.second_semester.end) : null;
 if(d>=firstStart&&d<=firstEnd)return {semester:"first" as const,effectiveFrom:rule.first_semester.start,effectiveTo:rule.first_semester.end,window:rule.first_semester.option_window,cancellationDeadline:rule.first_semester.cancellation_deadline ?? null,renunciationWindow:undefined};
 if(secondStart&&secondEnd&&d>=secondStart&&d<=secondEnd)return {semester:"second" as const,effectiveFrom:rule.second_semester!.start,effectiveTo:rule.second_semester!.end,window:rule.second_semester!.option_window,cancellationDeadline:rule.second_semester!.cancellation_deadline ?? null,renunciationWindow:rule.second_semester!.renunciation_window};
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
 else if(currentEvent?.event_type==="cancelled" || currentEvent?.event_type==="renounced") model="simples_puro";
 else if(previousSemesterModel==="simples_hibrido") model="simples_hibrido";
 return {model,previousSemesterModel,event:currentEvent};
}

export async function recordIbsCbsOptionEvent(input:{companyId:string;eventType:EventType;period:string;ruleVersionId:string;now?:Date}){
 const db=initDb();
 const ruleResult=await db.query("SELECT parameters FROM tax_rules WHERE id=$1 AND code='SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027'",[input.ruleVersionId]);
 if(!ruleResult.rowCount)throw new Error("IBS/CBS option rule not found");
 const rule=ruleResult.rows[0].parameters as SimplesNationalIbsCbsOptionRule;
 const {semester,effectiveFrom,effectiveTo,window,cancellationDeadline,renunciationWindow}=semesterDates(rule,input.period);
 const now=input.now??new Date();
 if(input.eventType==="elected" && semester==="second"){
   const prior=await db.query("SELECT event_type FROM tax_company_ibs_cbs_option_events WHERE company_id=$1 AND effective_from=$2 AND effective_to=$3 ORDER BY occurred_at DESC LIMIT 1",[input.companyId,"2027-01-01","2027-06-30"]);
   if(prior.rows[0]?.event_type==="elected") throw new Error("second-semester election is unavailable while first-semester hybrid option remains active");
 }
 const windowStart=dateOnly(window.start),windowEnd=dateOnly(window.end);
 const deadline=cancellationDeadline?dateOnly(cancellationDeadline):null;
 const cancellationWindow=semesterDates(rule,input.period).semester==="first"
   ? (rule.first_semester.cancellation_window ?? (deadline?{start:window.start,end:cancellationDeadline!}:window))
   : null;
 const cancellationStart=cancellationWindow?dateOnly(cancellationWindow.start):null;
 const cancellationEnd=cancellationWindow?dateOnly(cancellationWindow.end):null;
 if(input.eventType==="elected"){
   if(now<windowStart||now>windowEnd)throw new Error("IBS/CBS election window has closed");
 } else if(input.eventType==="cancelled") {
   if(!cancellationWindow)throw new Error("second-semester cancellation is not the applicable flow");
   if(!cancellationStart||!cancellationEnd||now<cancellationStart||now>cancellationEnd)throw new Error("IBS/CBS cancellation window is closed");
   if(deadline && now>deadline)throw new Error("IBS/CBS cancellation deadline has passed");
 } else {
   if(!renunciationWindow)throw new Error("IBS/CBS renunciation window is not available");
   const renunciationStart=dateOnly(renunciationWindow.start),renunciationEnd=dateOnly(renunciationWindow.end);
   if(now<renunciationStart||now>renunciationEnd)throw new Error("IBS/CBS renunciation window is closed");
 }
 const id=randomUUID();
 await db.query("INSERT INTO tax_company_ibs_cbs_option_events (id,company_id,event_type,model,effective_from,effective_to,option_window_start,option_window_end,cancellation_window_start,cancellation_deadline,rule_version_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (company_id,effective_from,effective_to,event_type) DO NOTHING",[id,input.companyId,input.eventType,input.eventType==='elected'?'simples_hibrido':'simples_puro',effectiveFrom,effectiveTo,window.start,window.end,cancellationWindow?.start ?? renunciationWindow?.start ?? null,cancellationDeadline ?? null,input.ruleVersionId]);
 return id;
}
