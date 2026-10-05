import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prepareTaxProfile, simulateConsumptionTransition, calculateMeiLoad, calculateSimplesNationalAnexoI, calculateSimplesNationalAnexoII, calculateSimplesNationalByAnnex, calculateSimplesNationalBracketed2027, resolveSimplesNationalStartupRbt12, calculateFatorR, resolveSimplesNationalMonthlyRevenue, resolveSimplesNationalRevenueComposition, resolveSimplesNationalIbsCbsOption, resolveSimplesNationalStartOfActivityOption } from "../services/taxService.js";
import { getEffectiveIbsCbsOption, recordIbsCbsOptionEvent } from "../services/ibsCbsOptionService.js";
import { classifyFactorRActivity } from "../services/taxActivityClassificationService.js";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
import { calculationRateLimit } from "../middleware/calculationRateLimit.js";
import { recordTaxCalculation, getEffectiveTaxRule } from "../services/taxAuditService.js";
const router=Router();
const parseLimit=(v:unknown)=>{const n=Number(v??20);return Number.isInteger(n)&&n>=1&&n<=100?n:20;};
const parseOffset=(v:unknown)=>{const n=Number(v??0);return Number.isInteger(n)&&n>=0&&n<=100000?n:0;};
const parseIdempotencyKey=(req:any)=>{const raw=req.header("idempotency-key");if(raw===undefined)return undefined;const key=raw.trim();if(!key||key.length>200)throw new Error("invalid idempotency key");return key;};
const requiredFiscalHistoryMonths=(openedAt:unknown,period:string)=>{const p=new Date(period+"-01T00:00:00Z");const windowStart=new Date(p);windowStart.setUTCMonth(windowStart.getUTCMonth()-12);if(!openedAt)return 12;const opened=new Date(String(openedAt).slice(0,10)+"T00:00:00Z");if(Number.isNaN(opened.getTime()))return 12;const start=new Date(Math.max(opened.getTime(),windowStart.getTime()));start.setUTCDate(1);const months=(p.getUTCFullYear()-start.getUTCFullYear())*12+(p.getUTCMonth()-start.getUTCMonth());return Math.max(0,Math.min(12,months));};

router.post("/profile",requireAuth,async(req,res)=>{try{const p=prepareTaxProfile(req.body);const id=randomUUID();await initDb().query("INSERT INTO tax_profiles (id,user_id,taxpayer_type,country,state,tax_year,data) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,tax_year) DO UPDATE SET taxpayer_type=EXCLUDED.taxpayer_type,country=EXCLUDED.country,state=EXCLUDED.state,data=EXCLUDED.data,updated_at=now()",[id,(req as any).userId,p.taxpayerType,p.country,p.state??null,p.taxYear,JSON.stringify(req.body||{})]);res.status(201).json({id,profile:p});}catch(e){res.status(400).json({valid:false,error:e instanceof Error?e.message:"invalid tax profile"});}});

router.get("/profiles",requireAuth,async(req,res)=>{try{const limit=parseLimit(req.query.limit),offset=parseOffset(req.query.offset),db=initDb();const r=await db.query("SELECT id,taxpayer_type,country,state,tax_year,data,created_at,updated_at FROM tax_profiles WHERE user_id=$1 ORDER BY tax_year DESC LIMIT $2 OFFSET $3",[(req as any).userId,limit,offset]);const count=await db.query("SELECT COUNT(*)::int count FROM tax_profiles WHERE user_id=$1",[(req as any).userId]);res.json({profiles:r.rows,pagination:{limit,offset,total:Number(count.rows[0].count),hasMore:offset+r.rows.length<Number(count.rows[0].count)}});}catch{res.status(500).json({error:"failed to load tax profiles"});}});

router.post("/profile/validate",requireAuth,(req,res)=>{try{res.json({valid:true,profile:prepareTaxProfile(req.body)});}catch(e){res.status(400).json({valid:false,error:e instanceof Error?e.message:"invalid tax profile"});}});

router.post("/mei/load",requireAuth,calculationRateLimit,async(req,res)=>{try{
 const year=Number(req.body?.year??new Date().getUTCFullYear());
 const month=Number(req.body?.month??1);
 const ruleCode=typeof req.body?.ruleCode==="string"&&req.body.ruleCode.trim()?req.body.ruleCode.trim():"MEI_2026";
 const rule=await getEffectiveTaxRule(ruleCode,new Date(Date.UTC(year,month-1,1)));
 if(!rule)return res.status(404).json({error:"tax rule not found for requested period"});
 const output=calculateMeiLoad({...req.body,year},rule.parameters as any);
 const companyId=typeof req.body?.companyId==="string"&&req.body.companyId.trim()?req.body.companyId.trim():null;
 if(!companyId)return res.status(400).json({error:"companyId is required for audited calculations"});
 const ownership=await initDb().query("SELECT id,opened_at FROM tax_companies WHERE id=$1 AND user_id=$2",[companyId,(req as any).userId]);
 if(!ownership.rowCount)return res.status(403).json({error:"company not found or not owned by user"});
 const enriched={...output,ruleVersion:{id:rule.id,code:rule.rule_code,version:rule.version,effectiveFrom:rule.effective_from,effectiveTo:rule.effective_to,sourceUrl:rule.source_url,sourceReference:rule.source_reference,parameters:rule.parameters}};
 if(companyId){const audit=await recordTaxCalculation(companyId,(req as any).userId,"mei_load",req.body,enriched,rule.id,parseIdempotencyKey(req));if(!audit)return res.status(403).json({error:"company not found or not owned by user"});}
 res.json(enriched);
}catch(e){if(e instanceof Error && (e as Error & {code?:string}).code==="IDEMPOTENCY_CONFLICT")return res.status(409).json({error:e.message});if(e instanceof Error && (e as Error & {code?:string}).code==="54000")return res.status(429).json({error:e.message});res.status(400).json({error:e instanceof Error?e.message:"invalid MEI data"});}});

router.post("/simulate/consumption-transition",requireAuth,calculationRateLimit,async(req,res)=>{try{
 const input={base:Number(req.body?.base),year:Number(req.body?.year)};
 const ruleCode=typeof req.body?.ruleCode==="string"&&req.body.ruleCode.trim()?req.body.ruleCode.trim():"RTC_CONSUMPTION_2026";
 const rule=await getEffectiveTaxRule(ruleCode,new Date(Date.UTC(input.year,0,1)));
 if(!rule)return res.status(404).json({error:"tax rule not found for requested year"});
 const output=simulateConsumptionTransition(input,rule.parameters as any);
 const companyId=typeof req.body?.companyId==="string"&&req.body.companyId.trim()?req.body.companyId.trim():null;
 if(!companyId)return res.status(400).json({error:"companyId is required for audited calculations"});
 const enriched={...output,ruleVersion:{id:rule.id,code:rule.rule_code,version:rule.version,effectiveFrom:rule.effective_from,effectiveTo:rule.effective_to,sourceUrl:rule.source_url,sourceReference:rule.source_reference,parameters:rule.parameters}};
 if(companyId){const audit=await recordTaxCalculation(companyId,(req as any).userId,"consumption_transition",input,enriched,rule.id,parseIdempotencyKey(req));if(!audit)return res.status(403).json({error:"company not found or not owned by user"});}
 res.json(enriched);
}catch(e){if(e instanceof Error && (e as Error & {code?:string}).code==="IDEMPOTENCY_CONFLICT")return res.status(409).json({error:e.message});if(e instanceof Error && (e as Error & {code?:string}).code==="54000")return res.status(429).json({error:e.message});res.status(400).json({error:e instanceof Error?e.message:"invalid simulation"});}});

router.post("/simples-nacional/revenue-base",requireAuth,calculationRateLimit,async(req,res)=>{try{
 const period=typeof req.body?.period==="string"?req.body.period.trim():"";
 const requestedOptionModel=req.body?.optionModel==="simples_hibrido"?"simples_hibrido":req.body?.optionModel==="simples_puro"?"simples_puro":undefined;
 const companyId=typeof req.body?.companyId==="string"&&req.body.companyId.trim()?req.body.companyId.trim():null;
 if(!/^2027-(0[1-9]|1[0-2])$/.test(period))return res.status(400).json({error:"period must be a 2027 month in YYYY-MM format"});
 if(!companyId)return res.status(400).json({error:"companyId is required for audited calculations"});
 const db=initDb();
 const ownership=await db.query("SELECT id,opened_at FROM tax_companies WHERE id=$1 AND user_id=$2",[companyId,(req as any).userId]);
 if(!ownership.rowCount)return res.status(403).json({error:"company not found or not owned by user"});
 const revenueRule=await getEffectiveTaxRule("SIMPLES_NACIONAL_REVENUE_COMPOSITION_2027",new Date(period+"-01T00:00:00Z"));
 const optionRule=await getEffectiveTaxRule("SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027",new Date(period+"-01T00:00:00Z"));
 if(!optionRule)return res.status(404).json({error:"2027 IBS/CBS option rule not found"});
 if(!revenueRule)return res.status(404).json({error:"2027 Simples revenue composition rule not found"});
 const effectiveOption=await getEffectiveIbsCbsOption(companyId,period,optionRule.parameters as any);
 const optionModel=effectiveOption.model;
 if(requestedOptionModel&&requestedOptionModel!==optionModel)return res.status(409).json({error:"requested IBS/CBS option model does not match the company's effective option state",effectiveOptionModel:optionModel});

 const currentDoc=await db.query(`SELECT COALESCE(SUM(revenue_amount),0)::numeric gross_revenue,COALESCE(SUM(regular_ibs_cbs_amount),0)::numeric regular_ibs_cbs,COUNT(*)::int document_count,COUNT(*) FILTER (WHERE classification_status<>'classified')::int unresolved_count FROM tax_fiscal_documents WHERE company_id=$1 AND status='active' AND to_char(issued_at AT TIME ZONE 'UTC','YYYY-MM')=$2`,[companyId,period]);
 const historyDoc=await db.query(`SELECT COALESCE(SUM(revenue_amount),0)::numeric gross_revenue_12m,COALESCE(SUM(regular_ibs_cbs_amount),0)::numeric regular_ibs_cbs_12m,COUNT(*)::int document_count,COUNT(*) FILTER (WHERE classification_status<>'classified')::int unresolved_count,COUNT(DISTINCT to_char(issued_at AT TIME ZONE 'UTC','YYYY-MM'))::int covered_months FROM tax_fiscal_documents WHERE company_id=$1 AND status='active' AND issued_at >= (to_date($2||'-01','YYYY-MM-DD') - interval '12 months') AND issued_at < to_date($2||'-01','YYYY-MM-DD')`,[companyId,period]);
 const cd=currentDoc.rows[0],hd=historyDoc.rows[0];
 const docsInWindow=Number(cd.document_count)+Number(hd.document_count)>0;
 let monthlyGross=0,monthlyRegular=0,revenue12m=0,regular12m=0,revenueSource:"fiscal_documents"|"tax_revenues"="tax_revenues",fiscalDocumentCount=0;
 if(docsInWindow){
   const unresolved=Number(cd.unresolved_count)+Number(hd.unresolved_count);
   if(unresolved>0)return res.status(409).json({status:"needs_review",error:"fiscal documents in the RBT12 window include documents without final classification",unresolvedFiscalDocumentCount:unresolved,revenueBasis:"fiscal_documents"});
   monthlyGross=Number(cd.gross_revenue);monthlyRegular=Number(cd.regular_ibs_cbs);revenue12m=Number(hd.gross_revenue_12m);regular12m=Number(hd.regular_ibs_cbs_12m);fiscalDocumentCount=Number(cd.document_count)+Number(hd.document_count);revenueSource="fiscal_documents";
   const requiredMonths=requiredFiscalHistoryMonths(ownership.rows[0]?.opened_at,period); if(Number(hd.covered_months)<requiredMonths)return res.status(409).json({status:"needs_review",error:"fiscal document source does not cover the required historical months of the RBT12 window; a missing month cannot be treated as proof of zero activity",coveredMonths:Number(hd.covered_months),requiredMonths,coverageStatus:"incomplete",revenueBasis:"fiscal_documents"});
 }else{
   const current=await db.query("SELECT amount,regular_ibs_cbs_amount FROM tax_revenues WHERE company_id=$1 AND reference_month=$2",[companyId,period]);
   const history=await db.query("SELECT COALESCE(SUM(amount),0)::numeric gross_revenue_12m,COALESCE(SUM(regular_ibs_cbs_amount),0)::numeric regular_ibs_cbs_12m FROM tax_revenues WHERE company_id=$1 AND reference_month >= to_char(to_date($2||'-01','YYYY-MM-DD') - interval '12 months','YYYY-MM') AND reference_month < $2",[companyId,period]);
   monthlyGross=Number(current.rows[0]?.amount??0);monthlyRegular=Number(current.rows[0]?.regular_ibs_cbs_amount??0);revenue12m=Number(history.rows[0]?.gross_revenue_12m??0);regular12m=Number(history.rows[0]?.regular_ibs_cbs_12m??0);
 }
 const annual=resolveSimplesNationalRevenueComposition({year:2027,grossRevenueAccrued:revenue12m,regularIbsCbsAmount:regular12m,optionModel},revenueRule.parameters as any);
 const monthly=resolveSimplesNationalRevenueComposition({year:2027,grossRevenueAccrued:monthlyGross,regularIbsCbsAmount:monthlyRegular,optionModel},revenueRule.parameters as any);
 const input={companyId,period,optionModel,grossRevenue12m:revenue12m,regularIbsCbsRevenue12m:regular12m,monthlyGrossRevenue:monthlyGross,regularIbsCbsMonthlyRevenue:monthlyRegular,revenueSource,fiscalDocumentCount};
 const enriched={...input,simplesRevenue12m:annual.simplesGrossRevenue,simplesMonthlyRevenue:monthly.simplesGrossRevenue,excludedRegularIbsCbs12m:annual.regularIbsCbsAmountExcluded,excludedRegularIbsCbsMonthly:monthly.regularIbsCbsAmountExcluded,revenueBasis:annual.revenueBasis,sourceOfTruth:revenueSource,ruleVersion:{id:revenueRule.id,code:revenueRule.rule_code,version:revenueRule.version,effectiveFrom:revenueRule.effective_from,effectiveTo:revenueRule.effective_to,sourceUrl:revenueRule.source_url,sourceReference:revenueRule.source_reference,parameters:revenueRule.parameters}};
 const audit=await recordTaxCalculation(companyId,(req as any).userId,"simples_nacional_revenue_base",input,enriched,revenueRule.id,parseIdempotencyKey(req));
 if(!audit)return res.status(403).json({error:"company not found or not owned by user"});
 res.json(enriched);
}catch(e){if(e instanceof Error&&(e as Error & {code?:string}).code==="IDEMPOTENCY_CONFLICT")return res.status(409).json({error:e.message});if(e instanceof Error&&(e as Error & {code?:string}).code==="54000")return res.status(429).json({error:e.message});res.status(400).json({error:e instanceof Error?e.message:"invalid Simples revenue base"});}});
router.post("/simples-nacional/calculate-2027",requireAuth,calculationRateLimit,async(req,res)=>{try{
 const period=typeof req.body?.period==="string"?req.body.period.trim():"";
 const companyId=typeof req.body?.companyId==="string"&&req.body.companyId.trim()?req.body.companyId.trim():null;
 const annex=req.body?.annex==="II"?"II":req.body?.annex==="I"?"I":null;
 if(!/^2027-(0[1-9]|1[0-2])$/.test(period))return res.status(400).json({error:"period must be a 2027 month in YYYY-MM format"});
 if(!companyId)return res.status(400).json({error:"companyId is required for audited calculations"});
 if(!annex)return res.status(400).json({error:"annex must be I or II"});
 const db=initDb();
 const ownership=await db.query("SELECT id,opened_at FROM tax_companies WHERE id=$1 AND user_id=$2",[companyId,(req as any).userId]);
 if(!ownership.rowCount)return res.status(403).json({error:"company not found or not owned by user"});
 const revenueRule=await getEffectiveTaxRule("SIMPLES_NACIONAL_REVENUE_COMPOSITION_2027",new Date(period+"-01T00:00:00Z"));
 const optionRule=await getEffectiveTaxRule("SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027",new Date(period+"-01T00:00:00Z"));
 const annexRule=await getEffectiveTaxRule(`SIMPLES_NACIONAL_ANEXO_${annex}_2027`,new Date(period+"-01T00:00:00Z"));
 if(!revenueRule||!optionRule||!annexRule)return res.status(404).json({error:"required 2027 Simples rule version not found"});
 const effectiveOption=await getEffectiveIbsCbsOption(companyId,period,optionRule.parameters as any);
 const optionModel=effectiveOption.model;
 const currentDoc=await db.query(`SELECT COALESCE(SUM(revenue_amount),0)::numeric gross_revenue,COALESCE(SUM(regular_ibs_cbs_amount),0)::numeric regular_ibs_cbs,COUNT(*)::int document_count,COUNT(*) FILTER (WHERE classification_status<>'classified')::int unresolved_count FROM tax_fiscal_documents WHERE company_id=$1 AND status='active' AND to_char(issued_at AT TIME ZONE 'UTC','YYYY-MM')=$2`,[companyId,period]);
 const historyDoc=await db.query(`SELECT COALESCE(SUM(revenue_amount),0)::numeric gross_revenue_12m,COALESCE(SUM(regular_ibs_cbs_amount),0)::numeric regular_ibs_cbs_12m,COUNT(*)::int document_count,COUNT(*) FILTER (WHERE classification_status<>'classified')::int unresolved_count,COUNT(DISTINCT to_char(issued_at AT TIME ZONE 'UTC','YYYY-MM'))::int covered_months FROM tax_fiscal_documents WHERE company_id=$1 AND status='active' AND issued_at >= (to_date($2||'-01','YYYY-MM-DD') - interval '12 months') AND issued_at < to_date($2||'-01','YYYY-MM-DD')`,[companyId,period]);
 const cd=currentDoc.rows[0],hd=historyDoc.rows[0];
 const docsInWindow=Number(cd.document_count)+Number(hd.document_count)>0;
 let monthlyGross=0,monthlyRegular=0,revenue12m=0,regular12m=0,revenueSource:"fiscal_documents"|"tax_revenues"="tax_revenues",fiscalDocumentCount=0;
 if(docsInWindow){
   const unresolved=Number(cd.unresolved_count)+Number(hd.unresolved_count);
   if(unresolved>0)return res.status(409).json({status:"needs_review",error:"fiscal documents in the RBT12 window include documents without final classification",unresolvedFiscalDocumentCount:unresolved,revenueBasis:"fiscal_documents"});
   monthlyGross=Number(cd.gross_revenue);monthlyRegular=Number(cd.regular_ibs_cbs);revenue12m=Number(hd.gross_revenue_12m);regular12m=Number(hd.regular_ibs_cbs_12m);fiscalDocumentCount=Number(cd.document_count)+Number(hd.document_count);revenueSource="fiscal_documents";
   const requiredMonths=requiredFiscalHistoryMonths(ownership.rows[0]?.opened_at,period); if(Number(hd.covered_months)<requiredMonths)return res.status(409).json({status:"needs_review",error:"fiscal document source does not cover the required historical months of the RBT12 window; a missing month cannot be treated as proof of zero activity",coveredMonths:Number(hd.covered_months),requiredMonths,coverageStatus:"incomplete",revenueBasis:"fiscal_documents"});
 }else{
   const current=await db.query("SELECT amount,regular_ibs_cbs_amount FROM tax_revenues WHERE company_id=$1 AND reference_month=$2",[companyId,period]);
   const history=await db.query("SELECT COALESCE(SUM(amount),0)::numeric gross_revenue_12m,COALESCE(SUM(regular_ibs_cbs_amount),0)::numeric regular_ibs_cbs_12m FROM tax_revenues WHERE company_id=$1 AND reference_month >= to_char(to_date($2||'-01','YYYY-MM-DD') - interval '12 months','YYYY-MM') AND reference_month < $2",[companyId,period]);
   monthlyGross=Number(current.rows[0]?.amount??0);monthlyRegular=Number(current.rows[0]?.regular_ibs_cbs_amount??0);revenue12m=Number(history.rows[0]?.gross_revenue_12m??0);regular12m=Number(history.rows[0]?.regular_ibs_cbs_12m??0);
 }
 const annualComposition=resolveSimplesNationalRevenueComposition({year:2027,grossRevenueAccrued:revenue12m,regularIbsCbsAmount:regular12m,optionModel},revenueRule.parameters as any);
 const monthlyComposition=resolveSimplesNationalRevenueComposition({year:2027,grossRevenueAccrued:monthlyGross,regularIbsCbsAmount:monthlyRegular,optionModel},revenueRule.parameters as any);
 const startupRbt12=resolveSimplesNationalStartupRbt12({period,openedAt:ownership.rows[0]?.opened_at,historicalNetRevenue:annualComposition.simplesGrossRevenue,currentNetRevenue:monthlyComposition.simplesGrossRevenue},(annexRule.parameters as any)?.rbt12_start_of_activity);
 const effectiveRevenue12m=startupRbt12.revenue12m;
 const calculated=calculateSimplesNationalBracketed2027({revenue12m:effectiveRevenue12m,monthlyRevenue:monthlyGross,regularIbsCbsRevenue12m:regular12m,regularIbsCbsMonthlyRevenue:monthlyRegular,optionModel},annexRule.parameters as any,revenueRule.parameters as any);
 const input={companyId,period,annex,optionModel,revenue12m:effectiveRevenue12m,historicalRevenue12m:revenue12m,monthlyGrossRevenue:monthlyGross,regularIbsCbsRevenue12m:regular12m,regularIbsCbsMonthlyRevenue:monthlyRegular,revenueSource,fiscalDocumentCount};
 const enriched={...calculated,startOfActivityRbt12:startupRbt12,sourceOfTruth:revenueSource,fiscalDocumentCount,period,annex,ruleVersions:{
   revenueComposition:{id:revenueRule.id,code:revenueRule.rule_code,version:revenueRule.version,effectiveFrom:revenueRule.effective_from,effectiveTo:revenueRule.effective_to,sourceUrl:revenueRule.source_url,sourceReference:revenueRule.source_reference,parameters:revenueRule.parameters},
   annex:{id:annexRule.id,code:annexRule.rule_code,version:annexRule.version,effectiveFrom:annexRule.effective_from,effectiveTo:annexRule.effective_to,sourceUrl:annexRule.source_url,sourceReference:annexRule.source_reference,parameters:annexRule.parameters}
 }};
 const audit=await recordTaxCalculation(companyId,(req as any).userId,"simples_nacional_calculate_2027",input,enriched,annexRule.id,parseIdempotencyKey(req));
 if(!audit)return res.status(403).json({error:"company not found or not owned by user"});
 res.json(enriched);
}catch(e){if(e instanceof Error&&(e as any).code==="IDEMPOTENCY_CONFLICT")return res.status(409).json({error:e.message});if(e instanceof Error&&(e as any).code==="54000")return res.status(429).json({error:e.message});res.status(400).json({error:e instanceof Error?e.message:"invalid Simples Nacional 2027 calculation"});}});

router.post("/simples-nacional/anexo-ii",requireAuth,calculationRateLimit,async(req,res)=>{try{
 const revenue12m=Number(req.body?.revenue12m),monthlyRevenue=Number(req.body?.monthlyRevenue),year=Number(req.body?.year??new Date().getUTCFullYear());
 if(!Number.isInteger(year))return res.status(400).json({error:"year must be an integer"});
 const ruleCode=typeof req.body?.ruleCode==="string"&&req.body.ruleCode.trim()?req.body.ruleCode.trim():`SIMPLES_NACIONAL_ANEXO_II_${year}`;
 const rule=await getEffectiveTaxRule(ruleCode,new Date(Date.UTC(year,0,1)));
 if(!rule)return res.status(404).json({error:"tax rule not found for requested year"});
 const companyId=typeof req.body?.companyId==="string"&&req.body.companyId.trim()?req.body.companyId.trim():null;
 if(!companyId)return res.status(400).json({error:"companyId is required for audited calculations"});
 const input={revenue12m,monthlyRevenue,year};
 const output=calculateSimplesNationalAnexoII(input,rule.parameters as any);
 const enriched={...output,ruleVersion:{id:rule.id,code:rule.rule_code,version:rule.version,effectiveFrom:rule.effective_from,effectiveTo:rule.effective_to,sourceUrl:rule.source_url,sourceReference:rule.source_reference,parameters:rule.parameters}};
 const audit=await recordTaxCalculation(companyId,(req as any).userId,"simples_nacional_anexo_ii",input,enriched,rule.id,parseIdempotencyKey(req));
 if(!audit)return res.status(403).json({error:"company not found or not owned by user"});
 res.json(enriched);
}catch(e){if(e instanceof Error && (e as Error & {code?:string}).code==="IDEMPOTENCY_CONFLICT")return res.status(409).json({error:e.message});if(e instanceof Error && (e as Error & {code?:string}).code==="54000")return res.status(429).json({error:e.message});res.status(400).json({error:e instanceof Error?e.message:"invalid Simples Nacional data"});}});
router.post("/simples-nacional/anexo-i",requireAuth,calculationRateLimit,async(req,res)=>{try{
 const revenue12m=Number(req.body?.revenue12m),monthlyRevenue=Number(req.body?.monthlyRevenue),year=Number(req.body?.year??new Date().getUTCFullYear());
 if(!Number.isInteger(year))return res.status(400).json({error:"year must be an integer"});
 const ruleCode=typeof req.body?.ruleCode==="string"&&req.body.ruleCode.trim()?req.body.ruleCode.trim():`SIMPLES_NACIONAL_ANEXO_I_${year}`;
 const rule=await getEffectiveTaxRule(ruleCode,new Date(Date.UTC(year,0,1)));
 if(!rule)return res.status(404).json({error:"tax rule not found for requested year"});
 const companyId=typeof req.body?.companyId==="string"&&req.body.companyId.trim()?req.body.companyId.trim():null;
 if(!companyId)return res.status(400).json({error:"companyId is required for audited calculations"});
 const input={revenue12m,monthlyRevenue,year};
 const output=calculateSimplesNationalAnexoI(input,rule.parameters as any);
 const enriched={...output,ruleVersion:{id:rule.id,code:rule.rule_code,version:rule.version,effectiveFrom:rule.effective_from,effectiveTo:rule.effective_to,sourceUrl:rule.source_url,sourceReference:rule.source_reference,parameters:rule.parameters}};
 const audit=await recordTaxCalculation(companyId,(req as any).userId,"simples_nacional_anexo_i",input,enriched,rule.id,parseIdempotencyKey(req));
 if(!audit)return res.status(403).json({error:"company not found or not owned by user"});
 res.json(enriched);
}catch(e){if(e instanceof Error && (e as Error & {code?:string}).code==="IDEMPOTENCY_CONFLICT")return res.status(409).json({error:e.message});if(e instanceof Error && (e as Error & {code?:string}).code==="54000")return res.status(429).json({error:e.message});res.status(400).json({error:e instanceof Error?e.message:"invalid Simples Nacional data"});}});

router.post("/simples-nacional/start-of-activity-option",requireAuth,calculationRateLimit,async(req,res)=>{try{
 const cnpjRegistrationDate=typeof req.body?.cnpjRegistrationDate==="string"?req.body.cnpjRegistrationDate.trim():"";
 const period=typeof req.body?.period==="string"?req.body.period.trim():"";
 if(!cnpjRegistrationDate)return res.status(400).json({error:"cnpjRegistrationDate is required"});
 if(!period)return res.status(400).json({error:"period is required"});
 if(!/^2027-\\d{2}-\\d{2}$/.test(period))return res.status(400).json({error:"period must be in 2027"});
 const rule=await getEffectiveTaxRule("SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027",new Date(period+"T00:00:00Z"));
 if(!rule)return res.status(404).json({error:"Simples Nacional 2027 option rule not found for requested period"});
 const companyId=typeof req.body?.companyId==="string"&&req.body.companyId.trim()?req.body.companyId.trim():null;
 if(!companyId)return res.status(400).json({error:"companyId is required for audited calculations"});
 const output=resolveSimplesNationalStartOfActivityOption({
   cnpjRegistrationDate,
   period,
   rule:rule.parameters as any
 });
 const input={cnpjRegistrationDate,period,optionDecision:"start_of_activity_cnpj_registration"};
 const enriched={...output,ruleVersion:{id:rule.id,code:rule.rule_code,version:rule.version,effectiveFrom:rule.effective_from,effectiveTo:rule.effective_to,sourceUrl:rule.source_url,sourceReference:rule.source_reference,parameters:rule.parameters}};
 const audit=await recordTaxCalculation(companyId,(req as any).userId,"simples_nacional_start_of_activity_option",input,enriched,rule.id,parseIdempotencyKey(req));
 if(!audit)return res.status(403).json({error:"company not found or not owned by user"});
 res.json(enriched);
}catch(e){if(e instanceof Error && (e as Error & {code?:string}).code==="IDEMPOTENCY_CONFLICT")return res.status(409).json({error:e.message});if(e instanceof Error && (e as Error & {code?:string}).code==="54000")return res.status(429).json({error:e.message});res.status(400).json({error:e instanceof Error?e.message:"invalid Simples Nacional start-of-activity data"});}});
router.post("/simples-nacional/ibs-cbs-options",requireAuth,calculationRateLimit,async(req,res)=>{try{
 const period=typeof req.body?.period==="string"?req.body.period.trim():"";
 const year=Number(period.slice(0,4));
 if(year!==2027)return res.status(400).json({error:"period must be in 2027"});
 const rule=await getEffectiveTaxRule("SIMPLES_NACIONAL_IBS_CBS_OPTIONS_2027",new Date(period+"T00:00:00Z"));
 if(!rule)return res.status(404).json({error:"IBS/CBS option rule not found for requested period"});
 const companyId=typeof req.body?.companyId==="string"&&req.body.companyId.trim()?req.body.companyId.trim():null;
 if(!companyId)return res.status(400).json({error:"companyId is required for audited calculations"});
 const optionModel=req.body?.optionModel==="simples_hibrido"?"simples_hibrido":req.body?.optionModel==="simples_puro"?"simples_puro":undefined;
 const optionAction=req.body?.optionAction;
 if(optionAction!==undefined&&optionAction!=="elected"&&optionAction!=="cancel")return res.status(400).json({error:"optionAction must be elected or cancel"});
 if(optionAction==="elected")await recordIbsCbsOptionEvent({companyId,eventType:"elected",period,ruleVersionId:rule.id});
 if(optionAction==="cancel")await recordIbsCbsOptionEvent({companyId,eventType:"cancelled",period,ruleVersionId:rule.id});
 const effective=await getEffectiveIbsCbsOption(companyId,period,rule.parameters as any);
 const output=resolveSimplesNationalIbsCbsOption({period,optionModel:effective.model,previousSemesterModel:effective.previousSemesterModel,rule:rule.parameters as any});
 const input={period,optionAction:optionAction??"status",optionModel:effective.model,previousSemesterModel:effective.previousSemesterModel};
 const enriched={...output,ruleVersion:{id:rule.id,code:rule.rule_code,version:rule.version,effectiveFrom:rule.effective_from,effectiveTo:rule.effective_to,sourceUrl:rule.source_url,sourceReference:rule.source_reference,parameters:rule.parameters}};
 const audit=await recordTaxCalculation(companyId,(req as any).userId,"simples_nacional_ibs_cbs_options",input,enriched,rule.id,parseIdempotencyKey(req));
 if(!audit)return res.status(403).json({error:"company not found or not owned by user"});
 res.json(enriched);
}catch(e){if(e instanceof Error && (e as Error & {code?:string}).code==="IDEMPOTENCY_CONFLICT")return res.status(409).json({error:e.message});if(e instanceof Error && (e as Error & {code?:string}).code==="54000")return res.status(429).json({error:e.message});res.status(400).json({error:e instanceof Error?e.message:"invalid IBS/CBS option data"});}});
router.post("/simples-nacional/fator-r",requireAuth,calculationRateLimit,async(req,res)=>{try{
 const year=Number(req.body?.year??new Date().getUTCFullYear());
 const month=Number(req.body?.month??new Date().getUTCMonth()+1);
 if(!Number.isInteger(year)||year<2020||year>2100)return res.status(400).json({error:"year must be a valid integer"});
 if(!Number.isInteger(month)||month<1||month>12)return res.status(400).json({error:"month must be between 1 and 12"});
 const period=new Date(Date.UTC(year,month-1,1));
 const factorRuleCode=typeof req.body?.factorRuleCode==="string"&&req.body.factorRuleCode.trim()?req.body.factorRuleCode.trim():`SIMPLES_NACIONAL_FATOR_R_${year}`;
 const factorRule=await getEffectiveTaxRule(factorRuleCode,period);
 if(!factorRule)return res.status(404).json({error:"Fator R rule not found for requested period"});
 const factorInput={
   revenue12m:Number(req.body?.revenue12m),
   employeeAndAvulsoRemuneration12m:Number(req.body?.employeeAndAvulsoRemuneration12m),
   individualContributorRemuneration12m:Number(req.body?.individualContributorRemuneration12m),
   thirteenthSalary12m:Number(req.body?.thirteenthSalary12m),
   employerSocialSecurityContribution12m:Number(req.body?.employerSocialSecurityContribution12m),
   fgts12m:Number(req.body?.fgts12m)
 };
 const activityStartDateRaw=typeof req.body?.activityStartDate==="string"&&req.body.activityStartDate.trim()?req.body.activityStartDate.trim():null;
 let activityStartDate:Date|null=null;
 let periodContext:any=null;
 if(activityStartDateRaw){
   const parsed=new Date(activityStartDateRaw+"T00:00:00Z");
   if(Number.isNaN(parsed.getTime()))return res.status(400).json({error:"invalid activityStartDate"});
   if(parsed>period)return res.status(400).json({error:"activityStartDate cannot be after calculation period"});
   activityStartDate=parsed;
   const startIndex=parsed.getUTCFullYear()*12+parsed.getUTCMonth();
   const periodIndex=year*12+(month-1);
   const elapsed=periodIndex-startIndex;
   const fspa=Number(req.body?.fspa);
   const rpa=Number(req.body?.rpa);
   if(elapsed===0){
     if(!Number.isFinite(fspa)||fspa<0||!Number.isFinite(rpa)||rpa<0)return res.status(400).json({error:"fspa and rpa are required and must be non-negative numbers for the opening month"});
     periodContext={mode:"opening_month",fspa,rpa};
   }else if(elapsed>0&&elapsed<12){
     const fixedStartupMonths=Number((factorRule.parameters as any)?.startup_fixed_months||0);
     if(fixedStartupMonths>=2 && elapsed<fixedStartupMonths){
       periodContext={mode:"startup",priorMonths:[]};
     }else{
       const priorMonths=req.body?.priorMonths;
       if(!Array.isArray(priorMonths)||priorMonths.length!==elapsed-1)return res.status(400).json({error:`priorMonths must contain exactly ${Math.max(elapsed-1,0)} applicable historical month entries`});
       const expectedMonths=Array.from({length:Math.max(elapsed-1,0)},(_,i)=>{const d=new Date(Date.UTC(year,month-1,1));d.setUTCMonth(d.getUTCMonth()-(elapsed-i));return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1};});
       const invalidPeriod=priorMonths.some((item:any,i:number)=>Number(item?.year)!==expectedMonths[i].year||Number(item?.month)!==expectedMonths[i].month);
       if(invalidPeriod)return res.status(400).json({error:"priorMonths must identify each applicable historical month in chronological order, excluding the month immediately before the calculation period"});
       if(priorMonths.some((item:any)=>!item||!Number.isFinite(Number(item.fs))||Number(item.fs)<0||!Number.isFinite(Number(item.revenue))||Number(item.revenue)<0))return res.status(400).json({error:"priorMonths entries must contain non-negative numeric fs and revenue"});
       if(priorMonths.some((item:any)=>!item.evidence||typeof item.evidence.sourceReference!=="string"||!item.evidence.sourceReference.trim()||typeof item.evidence.ruleVersionId!=="string"||!["mei","simples_nacional"].includes(item.evidence.regime)))return res.status(422).json({error:"each priorMonths entry requires monthly normative evidence: regime, sourceReference and ruleVersionId",code:"FACTOR_R_MONTHLY_EVIDENCE_REQUIRED"});
       for(const item of priorMonths){
         const evidenceRule=await initDb().query("SELECT id,code,effective_from,effective_to FROM tax_rules WHERE id=$1",[item.evidence.ruleVersionId]);
         if(!evidenceRule.rowCount)return res.status(422).json({error:"monthly evidence references an unknown tax rule version",code:"FACTOR_R_EVIDENCE_RULE_NOT_FOUND"});
         const ev=evidenceRule.rows[0];
         const evDate=new Date(Date.UTC(Number(item.year),Number(item.month)-1,1));
         const effectiveFrom=new Date(String(ev.effective_from)+"T00:00:00Z");
         const effectiveTo=ev.effective_to?new Date(String(ev.effective_to)+"T00:00:00Z"):null;
         if(evDate<effectiveFrom||(effectiveTo&&evDate>effectiveTo))return res.status(422).json({error:"monthly evidence rule is not effective for the referenced month",code:"FACTOR_R_EVIDENCE_RULE_NOT_EFFECTIVE"});
         const expectedPrefix=item.evidence.regime==="mei"?"MEI_":"SIMPLES_NACIONAL_";
         if(!String(ev.code).startsWith(expectedPrefix))return res.status(422).json({error:"monthly evidence rule does not match the declared regime",code:"FACTOR_R_EVIDENCE_REGIME_RULE_MISMATCH"});
       }
       periodContext={mode:"startup",priorMonths:priorMonths.map((item:any)=>({year:Number(item.year),month:Number(item.month),fs:Number(item.fs),revenue:Number(item.revenue),regime:item.evidence.regime,origin:item.evidence.sourceReference,evidence:{regime:item.evidence.regime,sourceReference:item.evidence.sourceReference,ruleVersionId:item.evidence.ruleVersionId}}))};
     }
   }else if(elapsed>=12){
     const history=req.body?.history;
     if(!Array.isArray(history)||history.length!==12)return res.status(400).json({error:"history must contain exactly 12 monthly entries for an established Fator R calculation"});
     if(history.some((item:any)=>!item||!Number.isFinite(Number(item.fs))||Number(item.fs)<0||!Number.isFinite(Number(item.revenue))||Number(item.revenue)<0))return res.status(400).json({error:"history entries must contain non-negative numeric fs and revenue"});
     if(history.some((item:any)=>!item.evidence||typeof item.evidence.sourceReference!=="string"||!item.evidence.sourceReference.trim()||typeof item.evidence.ruleVersionId!=="string"||!["mei","simples_nacional"].includes(item.evidence.regime)))return res.status(422).json({error:"each history entry requires monthly normative evidence: regime, sourceReference and ruleVersionId",code:"FACTOR_R_MONTHLY_EVIDENCE_REQUIRED"});
     for(const item of history){
       const evidenceRule=await initDb().query("SELECT id,code,effective_from,effective_to FROM tax_rules WHERE id=$1",[item.evidence.ruleVersionId]);
       if(!evidenceRule.rowCount)return res.status(422).json({error:"monthly evidence references an unknown tax rule version",code:"FACTOR_R_EVIDENCE_RULE_NOT_FOUND"});
       const ev=evidenceRule.rows[0];
       const evDate=new Date(Date.UTC(Number(item.year),Number(item.month)-1,1));
       const effectiveFrom=new Date(String(ev.effective_from)+"T00:00:00Z");
       const effectiveTo=ev.effective_to?new Date(String(ev.effective_to)+"T00:00:00Z"):null;
       if(evDate<effectiveFrom||(effectiveTo&&evDate>effectiveTo))return res.status(422).json({error:"monthly evidence rule is not effective for the referenced month",code:"FACTOR_R_EVIDENCE_RULE_NOT_EFFECTIVE"});
       const expectedPrefix=item.evidence.regime==="mei"?"MEI_":"SIMPLES_NACIONAL_";
       if(!String(ev.code).startsWith(expectedPrefix))return res.status(422).json({error:"monthly evidence rule does not match the declared regime",code:"FACTOR_R_EVIDENCE_REGIME_RULE_MISMATCH"});
     }
     const expected=Array.from({length:12},(_,i)=>{const d=new Date(Date.UTC(year,month-1,1));d.setUTCMonth(d.getUTCMonth()-(12-i));return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1};});
     if(history.some((item:any,i:number)=>Number(item.year)!==expected[i].year||Number(item.month)!==expected[i].month))return res.status(400).json({error:"history must contain exactly the 12 months immediately preceding the calculation period in chronological order"});
     periodContext={mode:"established",history:history.map((item:any)=>({year:Number(item.year),month:Number(item.month),fs:Number(item.fs),revenue:Number(item.revenue),regime:item.evidence.regime,origin:item.evidence.sourceReference,evidence:{regime:item.evidence.regime,sourceReference:item.evidence.sourceReference,ruleVersionId:item.evidence.ruleVersionId}}))};
   }else if(elapsed<0){
     return res.status(400).json({error:"activityStartDate cannot be after calculation period"});
   }
 }
 if(!activityStartDateRaw){
   const history=req.body?.history;
   if(!Array.isArray(history)||history.length!==12)return res.status(400).json({error:"history must contain exactly 12 monthly entries for an established Fator R calculation"});
   const expected=Array.from({length:12},(_,i)=>{const d=new Date(Date.UTC(year,month-1,1));d.setUTCMonth(d.getUTCMonth()-(12-i));return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1};});
   if(history.some((item:any,i:number)=>Number(item?.year)!==expected[i].year||Number(item?.month)!==expected[i].month))return res.status(400).json({error:"history must contain exactly the 12 months immediately preceding the calculation period in chronological order"});
   if(history.some((item:any)=>!item||!Number.isFinite(Number(item.fs))||Number(item.fs)<0||!Number.isFinite(Number(item.revenue))||Number(item.revenue)<0))return res.status(400).json({error:"history entries must contain non-negative numeric fs and revenue"});
   if(history.some((item:any)=>!item.evidence||typeof item.evidence.sourceReference!=="string"||!item.evidence.sourceReference.trim()||typeof item.evidence.ruleVersionId!=="string"||!["mei","simples_nacional"].includes(item.evidence.regime)))return res.status(422).json({error:"each history entry requires monthly normative evidence: regime, sourceReference and ruleVersionId",code:"FACTOR_R_MONTHLY_EVIDENCE_REQUIRED"});
   for(const item of history){
     const evidenceRule=await initDb().query("SELECT id,code,effective_from,effective_to FROM tax_rules WHERE id=$1",[item.evidence.ruleVersionId]);
     if(!evidenceRule.rowCount)return res.status(422).json({error:"monthly evidence references an unknown tax rule version",code:"FACTOR_R_EVIDENCE_RULE_NOT_FOUND"});
     const ev=evidenceRule.rows[0];
     const evDate=new Date(Date.UTC(Number(item.year),Number(item.month)-1,1));
     const effectiveFrom=new Date(String(ev.effective_from)+"T00:00:00Z");
     const effectiveTo=ev.effective_to?new Date(String(ev.effective_to)+"T00:00:00Z"):null;
     if(evDate<effectiveFrom||(effectiveTo&&evDate>effectiveTo))return res.status(422).json({error:"monthly evidence rule is not effective for the referenced month",code:"FACTOR_R_EVIDENCE_RULE_NOT_EFFECTIVE"});
     const expectedPrefix=item.evidence.regime==="mei"?"MEI_":"SIMPLES_NACIONAL_";
     if(!String(ev.code).startsWith(expectedPrefix))return res.status(422).json({error:"monthly evidence rule does not match the declared regime",code:"FACTOR_R_EVIDENCE_REGIME_RULE_MISMATCH"});
   }
   periodContext={mode:"established",history:history.map((item:any)=>({year:Number(item.year),month:Number(item.month),fs:Number(item.fs),revenue:Number(item.revenue),regime:item.evidence.regime,origin:item.evidence.sourceReference,evidence:{regime:item.evidence.regime,sourceReference:item.evidence.sourceReference,ruleVersionId:item.evidence.ruleVersionId}}))};
 }

 // From 2027 onward, fiscal documents are the authoritative source for RBT12 and
 // current-month revenue whenever the company has fiscal-document data in the
 // applicable window. The Fator R history still carries FS evidence supplied by
 // the caller, but its revenue side is resolved from the same fiscal source used
 // by the Simples 2027 calculation.
 const fiscalCompanyId=typeof req.body?.companyId==="string"&&req.body.companyId.trim()?req.body.companyId.trim():null;
 let fatorRevenueSource:"fiscal_documents"|"request"="request";
 let fiscalDocumentCount=0;
 if(year>=2027&&fiscalCompanyId){
   const db=initDb();
   const ownership=await db.query("SELECT id,opened_at FROM tax_companies WHERE id=$1 AND user_id=$2",[fiscalCompanyId,(req as any).userId]);
   if(!ownership.rowCount)return res.status(403).json({error:"company not found or not owned by user"});
   const fiscalWindow=await db.query(
     `SELECT to_char(issued_at AT TIME ZONE 'UTC','YYYY-MM') period,
             COALESCE(SUM(revenue_amount-regular_ibs_cbs_amount),0)::numeric simples_revenue,
             COUNT(*)::int document_count,
             COUNT(*) FILTER (WHERE classification_status<>'classified')::int unresolved_count
        FROM tax_fiscal_documents
       WHERE company_id=$1 AND status='active'
         AND issued_at >= (to_date($2||'-01','YYYY-MM-DD') - interval '12 months')
         AND issued_at < (to_date($2||'-01','YYYY-MM-DD') + interval '1 month')
       GROUP BY 1 ORDER BY 1`,
     [fiscalCompanyId,`${year}-${String(month).padStart(2,"0")}`]
   );
   fiscalDocumentCount=fiscalWindow.rows.reduce((sum:any,row:any)=>sum+Number(row.document_count),0);
   if(fiscalDocumentCount>0){
     const unresolved=fiscalWindow.rows.reduce((sum:any,row:any)=>sum+Number(row.unresolved_count),0);
     if(unresolved>0)return res.status(409).json({status:"needs_review",error:"fiscal documents in the Fator R revenue window include documents without final classification",unresolvedFiscalDocumentCount:unresolved,revenueBasis:"fiscal_documents"});
     const revenueByMonth=new Map<string,number>(fiscalWindow.rows.map((row:any)=>[String(row.period),Number(row.simples_revenue)]));
     const key=(y:number,m:number)=>`${y}-${String(m).padStart(2,"0")}`;
     const periodKey=key(year,month);
     const historyKeys=Array.from({length:12},(_,i)=>{const d=new Date(Date.UTC(year,month-1,1));d.setUTCMonth(d.getUTCMonth()-(12-i));return key(d.getUTCFullYear(),d.getUTCMonth()+1);});
     const historyRevenue=historyKeys.reduce((sum,k)=>sum+(revenueByMonth.get(k)??0),0);
     const coveredHistory=historyKeys.filter(k=>revenueByMonth.has(k)).length;
     const requiredMonths=requiredFiscalHistoryMonths(ownership.rows[0]?.opened_at,`${year}-${String(month).padStart(2,"0")}`); if(coveredHistory<requiredMonths)return res.status(409).json({status:"needs_review",error:"fiscal document source does not cover the required historical months of the RBT12 window; a missing month cannot be treated as proof of zero activity",coveredMonths:coveredHistory,requiredMonths,coverageStatus:"incomplete",revenueBasis:"fiscal_documents"});
     factorInput.revenue12m=historyRevenue;
     fatorRevenueSource="fiscal_documents";
     if(periodContext?.mode==="established"){
       periodContext.history=periodContext.history.map((item:any)=>({...item,revenue:revenueByMonth.get(key(Number(item.year),Number(item.month)))??0,origin:"fiscal_documents"}));
     }else if(periodContext?.mode==="startup"){
       periodContext.priorMonths=periodContext.priorMonths.map((item:any)=>({...item,revenue:revenueByMonth.get(key(Number(item.year),Number(item.month)))??0,origin:"fiscal_documents"}));
     }
     if(revenueByMonth.has(periodKey)){
       req.body.monthlyRevenue=revenueByMonth.get(periodKey)??0;
     }else if(fiscalDocumentCount>0){
       req.body.monthlyRevenue=0;
     }
   }
 }
 const factor=calculateFatorR(factorInput,factorRule.parameters as any,periodContext);
 const activityCnae=typeof req.body?.activityCnae==="string"&&req.body.activityCnae.trim()?req.body.activityCnae.trim():null;
 let activityClassification:any=null;
 let activityClassificationRule:any=null;
 if(activityCnae){
   activityClassificationRule=await getEffectiveTaxRule(`SIMPLES_NACIONAL_FATOR_R_ACTIVITY_CLASSIFICATION_${year}`,period);
   if(!activityClassificationRule)return res.status(404).json({error:"Fator R activity classification rule not found for requested period"});
   activityClassification=classifyFactorRActivity({type:"CNAE",value:activityCnae},activityClassificationRule.parameters as any);
   if(activityClassification.status==="unknown"){
     return res.status(422).json({
       error:"activity classification required",
       code:"FACTOR_R_ACTIVITY_CLASSIFICATION_REQUIRED",
       activityClassification
     });
   }
   if(activityClassification.status!=="factor_r_subject"){
     return res.status(422).json({
       error:"activity is not subject to Fator R",
       code:"ACTIVITY_NOT_SUBJECT_TO_FACTOR_R",
       activityClassification
     });
   }
 }
 const annexCode=`SIMPLES_NACIONAL_ANEXO_${factor.effectiveAnnex}_${year}`;
 const annexRule=await getEffectiveTaxRule(annexCode,period);
 if(!annexRule)return res.status(404).json({error:"effective Simples Nacional annex rule not found for requested period"});
 let monthlyRevenue=Number(req.body?.monthlyRevenue);
 let revenueRecognitionRule:any=null;
 let revenueRecognition:any=null;
 if(year>=2027){
   revenueRecognitionRule=await getEffectiveTaxRule(`SIMPLES_NACIONAL_REVENUE_RECOGNITION_${year}`,period);
   if(!revenueRecognitionRule)return res.status(404).json({error:"revenue recognition rule not found for requested period"});
   revenueRecognition=resolveSimplesNationalMonthlyRevenue({year,grossRevenueAccrued:req.body?.grossRevenueAccrued},revenueRecognitionRule.parameters as any);
   monthlyRevenue=revenueRecognition.monthlyRevenue;
   // When fiscal documents exist, their classified revenue is authoritative for
   // the actual Simples monthly calculation. The normative recognition result is
   // retained as evidence, while the fiscal-document net revenue wins as source of truth.
   if(fatorRevenueSource==="fiscal_documents"){
     monthlyRevenue=Number(req.body?.monthlyRevenue??0);
   }
 } else {
   if(!Number.isFinite(monthlyRevenue)||monthlyRevenue<0)return res.status(400).json({error:"monthlyRevenue must be a non-negative number"});
 }
 const annexOutput=calculateSimplesNationalByAnnex({revenue12m:factor.revenue12m,monthlyRevenue},annexRule.parameters as any);
 const companyId=typeof req.body?.companyId==="string"&&req.body.companyId.trim()?req.body.companyId.trim():null;
 if(!companyId)return res.status(400).json({error:"companyId is required for audited calculations"});
 const input={...factorInput,monthlyRevenue,year,month,revenueSource:fatorRevenueSource,fiscalDocumentCount};
 const enriched={
   regime:"simples_nacional",
   calculationType:"fator_r",
   revenueSource:fatorRevenueSource,
   fiscalDocumentCount,
   sourceOfTruth:fatorRevenueSource,
   period:{year,month},
   activityStartDate:activityStartDate?activityStartDate.toISOString().slice(0,10):null,
   factorR:{...factor},
   effectiveAnnex:factor.effectiveAnnex,
   activityClassification: activityClassification ? { ...activityClassification, ruleVersion:{id:activityClassificationRule.id,code:activityClassificationRule.rule_code,version:activityClassificationRule.version,effectiveFrom:activityClassificationRule.effective_from,effectiveTo:activityClassificationRule.effective_to,sourceUrl:activityClassificationRule.source_url,sourceReference:activityClassificationRule.source_reference,parameters:activityClassificationRule.parameters} } : null,
   annexCalculation:annexOutput,
   factorRuleVersion:{id:factorRule.id,code:factorRule.rule_code,version:factorRule.version,effectiveFrom:factorRule.effective_from,effectiveTo:factorRule.effective_to,sourceUrl:factorRule.source_url,sourceReference:factorRule.source_reference,parameters:factorRule.parameters},
   annexRuleVersion:{id:annexRule.id,code:annexRule.rule_code,version:annexRule.version,effectiveFrom:annexRule.effective_from,effectiveTo:annexRule.effective_to,sourceUrl:annexRule.source_url,sourceReference:annexRule.source_reference,parameters:annexRule.parameters},
   revenueRecognition: revenueRecognition ? {...revenueRecognition,ruleVersion:{id:revenueRecognitionRule.id,code:revenueRecognitionRule.rule_code,version:revenueRecognitionRule.version,effectiveFrom:revenueRecognitionRule.effective_from,effectiveTo:revenueRecognitionRule.effective_to,sourceUrl:revenueRecognitionRule.source_url,sourceReference:revenueRecognitionRule.source_reference,parameters:revenueRecognitionRule.parameters}} : null
 };
 const audit=await recordTaxCalculation(companyId,(req as any).userId,"simples_nacional_fator_r",input,enriched,factorRule.id,parseIdempotencyKey(req));
 if(!audit)return res.status(403).json({error:"company not found or not owned by user"});
 res.json(enriched);
}catch(e){
 if(e instanceof Error && (e as Error & {code?:string}).code==="IDEMPOTENCY_CONFLICT")return res.status(409).json({error:e.message});
 if(e instanceof Error && (e as Error & {code?:string}).code==="54000")return res.status(429).json({error:e.message});
 res.status(400).json({error:e instanceof Error?e.message:"invalid Fator R data"});
}});
router.get("/rules/effective",async(req,res)=>{try{const code=String(req.query.code||"").trim();if(!code)return res.status(400).json({error:"code is required"});const at=req.query.at?new Date(String(req.query.at)):new Date();if(Number.isNaN(at.getTime()))return res.status(400).json({error:"invalid date"});const rule=await getEffectiveTaxRule(code,at);if(!rule)return res.status(404).json({error:"effective rule not found"});res.json({rule});}catch{res.status(500).json({error:"failed to resolve effective tax rule"});}});
router.get("/calculation-audits",requireAuth,async(req,res)=>{try{const companyId=String(req.query.companyId||"");if(!companyId)return res.status(400).json({error:"companyId is required"});const limit=parseLimit(req.query.limit),offset=parseOffset(req.query.offset),db=initDb();const own=await db.query("SELECT id,legal_name,cnpj FROM tax_companies WHERE id=$1 AND user_id=$2",[companyId,(req as any).userId]);if(!own.rowCount)return res.status(404).json({error:"company not found"});const r=await db.query("SELECT id,calculation_type,input,output,rule_version_id,created_at FROM tax_calculation_audits WHERE company_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",[companyId,limit,offset]);const count=await db.query("SELECT COUNT(*)::int count FROM tax_calculation_audits WHERE company_id=$1",[companyId]);return res.json({company:own.rows[0],audits:r.rows,pagination:{limit,offset,total:Number(count.rows[0].count),hasMore:offset+r.rows.length<Number(count.rows[0].count)}});}catch{res.status(500).json({error:"failed to load calculation audits"});}});

router.get("/calculation-audits/export",requireAuth,async(req,res)=>{try{
 const companyId=String(req.query.companyId||"");
 if(!companyId)return res.status(400).json({error:"companyId is required"});
 const format=String(req.query.format||"json").toLowerCase();
 if(format!=="json"&&format!=="csv")return res.status(400).json({error:"format must be json or csv"});
 const limit=parseLimit(req.query.limit);
 const db=initDb();
 const own=await db.query("SELECT id,legal_name,cnpj FROM tax_companies WHERE id=$1 AND user_id=$2",[companyId,(req as any).userId]);
 if(!own.rowCount)return res.status(404).json({error:"company not found"});
 const r=await db.query(`SELECT a.id,a.calculation_type,a.input,a.output,a.created_at,
   rv.id AS rule_version_id,rv.code AS rule_code,rv.version AS rule_version,
   rv.effective_from,rv.effective_to,rv.source_url,rv.source_reference,rv.parameters
   FROM tax_calculation_audits a JOIN tax_rules rv ON rv.id=a.rule_version_id
   WHERE a.company_id=$1 ORDER BY a.created_at DESC LIMIT $2`,[companyId,limit]);
 const rows=r.rows.map((row:any)=>({id:row.id,calculationType:row.calculation_type,input:row.input,output:row.output,ruleVersion:{id:row.rule_version_id,code:row.rule_code,version:row.rule_version,effectiveFrom:row.effective_from,effectiveTo:row.effective_to,sourceUrl:row.source_url,sourceReference:row.source_reference,parameters:row.parameters},createdAt:row.created_at}));
 if(format==="csv"){
   const esc=(v:unknown)=>`"${String(v??"").replace(/"/g,'""')}"`;
   const lines=["id,calculation_type,created_at,rule_version_id,rule_code,rule_version,effective_from,effective_to,source_url,source_reference,rule_parameters,input,output",...rows.map((row:any)=>[row.id,row.calculationType,row.createdAt,row.ruleVersion.id,row.ruleVersion.code,row.ruleVersion.version,row.ruleVersion.effectiveFrom,row.ruleVersion.effectiveTo,row.ruleVersion.sourceUrl,row.ruleVersion.sourceReference,JSON.stringify(row.ruleVersion.parameters),JSON.stringify(row.input),JSON.stringify(row.output)].map(esc).join(","))];
   res.type("text/csv").set("Content-Disposition",`attachment; filename="tax-calculation-audits-${companyId}.csv"`).send(lines.join("\n")); return;
 }
 res.json({company:own.rows[0],audits:rows,limit});
}catch{res.status(500).json({error:"failed to export calculation audits"});}});

router.get("/rules",async(req,res)=>{try{const year=Number(req.query.year||new Date().getUTCFullYear());if(!Number.isInteger(year)||year<2020||year>2100)return res.status(400).json({error:"invalid year"});const r=await initDb().query("SELECT id,tax_year,code,name,version,source_url,source_reference,parameters,effective_from,effective_to FROM tax_rules WHERE tax_year=$1 AND active=true ORDER BY code,version",[year]);res.json({rules:r.rows});}catch{res.status(500).json({error:"failed to load tax rules"});}});

export default router;