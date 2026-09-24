import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prepareTaxProfile, simulateConsumptionTransition, calculateMeiLoad } from "../services/taxService.js";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
import { recordTaxCalculation } from "../services/taxAuditService.js";
const router=Router();
const parseLimit=(v:unknown)=>{const n=Number(v??20);return Number.isInteger(n)&&n>=1&&n<=100?n:20;};
const parseOffset=(v:unknown)=>{const n=Number(v??0);return Number.isInteger(n)&&n>=0&&n<=100000?n:0;};

router.post("/profile",requireAuth,async(req,res)=>{try{const p=prepareTaxProfile(req.body);const id=randomUUID();await initDb().query("INSERT INTO tax_profiles (id,user_id,taxpayer_type,country,state,tax_year,data) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,tax_year) DO UPDATE SET taxpayer_type=EXCLUDED.taxpayer_type,country=EXCLUDED.country,state=EXCLUDED.state,data=EXCLUDED.data,updated_at=now()",[id,(req as any).userId,p.taxpayerType,p.country,p.state??null,p.taxYear,JSON.stringify(req.body||{})]);res.status(201).json({id,profile:p});}catch(e){res.status(400).json({valid:false,error:e instanceof Error?e.message:"invalid tax profile"});}});

router.get("/profiles",requireAuth,async(req,res)=>{try{const limit=parseLimit(req.query.limit),offset=parseOffset(req.query.offset),db=initDb();const r=await db.query("SELECT id,taxpayer_type,country,state,tax_year,data,created_at,updated_at FROM tax_profiles WHERE user_id=$1 ORDER BY tax_year DESC LIMIT $2 OFFSET $3",[(req as any).userId,limit,offset]);const count=await db.query("SELECT COUNT(*)::int count FROM tax_profiles WHERE user_id=$1",[(req as any).userId]);res.json({profiles:r.rows,pagination:{limit,offset,total:Number(count.rows[0].count),hasMore:offset+r.rows.length<Number(count.rows[0].count)}});}catch{res.status(500).json({error:"failed to load tax profiles"});}});

router.post("/profile/validate",requireAuth,(req,res)=>{try{res.json({valid:true,profile:prepareTaxProfile(req.body)});}catch(e){res.status(400).json({valid:false,error:e instanceof Error?e.message:"invalid tax profile"});}});

router.post("/mei/load",requireAuth,async(req,res)=>{try{const output=calculateMeiLoad(req.body);const companyId=typeof req.body?.companyId==="string"?req.body.companyId:null;if(companyId){const audit=await recordTaxCalculation(companyId,(req as any).userId,"mei_load",req.body,output);if(!audit)return res.status(403).json({error:"company not found or not owned by user"});}res.json(output);}catch(e){res.status(400).json({error:e instanceof Error?e.message:"invalid MEI data"});}});

router.post("/simulate/consumption-transition",requireAuth,async(req,res)=>{try{const input={base:Number(req.body?.base),year:Number(req.body?.year)};const output=simulateConsumptionTransition(input);const companyId=typeof req.body?.companyId==="string"?req.body.companyId:null;if(companyId){const audit=await recordTaxCalculation(companyId,(req as any).userId,"consumption_transition",input,output);if(!audit)return res.status(403).json({error:"company not found or not owned by user"});}res.json(output);}catch(e){res.status(400).json({error:e instanceof Error?e.message:"invalid simulation"});}});

router.get("/rules",async(req,res)=>{try{const year=Number(req.query.year||2026);const r=await initDb().query("SELECT id,tax_year,code,name,version,source_url,source_reference,parameters FROM tax_rules WHERE tax_year=$1 AND active=true ORDER BY code,version",[year]);res.json({rules:r.rows});}catch{res.status(500).json({error:"failed to load tax rules"});}});

export default router;