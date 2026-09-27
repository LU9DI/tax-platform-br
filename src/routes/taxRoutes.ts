import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prepareTaxProfile, simulateConsumptionTransition, calculateMeiLoad, calculateSimplesNationalAnexoI } from "../services/taxService.js";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
import { calculationRateLimit } from "../middleware/calculationRateLimit.js";
import { recordTaxCalculation, getEffectiveTaxRule } from "../services/taxAuditService.js";
const router=Router();
const parseLimit=(v:unknown)=>{const n=Number(v??20);return Number.isInteger(n)&&n>=1&&n<=100?n:20;};
const parseOffset=(v:unknown)=>{const n=Number(v??0);return Number.isInteger(n)&&n>=0&&n<=100000?n:0;};
const parseIdempotencyKey=(req:any)=>{const raw=req.header("idempotency-key");if(raw===undefined)return undefined;const key=raw.trim();if(!key||key.length>200)throw new Error("invalid idempotency key");return key;};

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

router.post("/simples-nacional/anexo-i",requireAuth,calculationRateLimit,async(req,res)=>{try{
 const revenue12m=Number(req.body?.revenue12m),monthlyRevenue=Number(req.body?.monthlyRevenue),year=Number(req.body?.year??new Date().getUTCFullYear());
 if(!Number.isInteger(year))return res.status(400).json({error:"year must be an integer"});
 const ruleCode=typeof req.body?.ruleCode==="string"&&req.body.ruleCode.trim()?req.body.ruleCode.trim():"SIMPLES_NACIONAL_ANEXO_I_2026";
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