import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prepareTaxProfile, simulateConsumptionTransition, calculateMeiLoad } from "../services/taxService.js";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();

router.post("/profile",requireAuth,async(req,res)=>{try{const p=prepareTaxProfile(req.body);const id=randomUUID();await initDb().query("INSERT INTO tax_profiles (id,user_id,taxpayer_type,country,state,tax_year,data) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,tax_year) DO UPDATE SET taxpayer_type=EXCLUDED.taxpayer_type,country=EXCLUDED.country,state=EXCLUDED.state,data=EXCLUDED.data,updated_at=now()",[id,(req as any).userId,p.taxpayerType,p.country,p.state??null,p.taxYear,JSON.stringify(req.body||{})]);res.status(201).json({id,profile:p});}catch(e){res.status(400).json({valid:false,error:e instanceof Error?e.message:"invalid tax profile"});}});

router.get("/profiles",requireAuth,async(req,res)=>{try{const r=await initDb().query("SELECT id,taxpayer_type,country,state,tax_year,data,created_at,updated_at FROM tax_profiles WHERE user_id=$1 ORDER BY tax_year DESC",[(req as any).userId]);res.json({profiles:r.rows});}catch{res.status(500).json({error:"failed to load tax profiles"});}});

router.post("/profile/validate",requireAuth,(req,res)=>{try{res.json({valid:true,profile:prepareTaxProfile(req.body)});}catch(e){res.status(400).json({valid:false,error:e instanceof Error?e.message:"invalid tax profile"});}});

router.post("/mei/load",requireAuth,(req,res)=>{try{res.json(calculateMeiLoad(req.body));}catch(e){res.status(400).json({error:e instanceof Error?e.message:"invalid MEI data"});}});

router.post("/simulate/consumption-transition",requireAuth,(req,res)=>{try{res.json(simulateConsumptionTransition({base:Number(req.body?.base),year:Number(req.body?.year)}));}catch(e){res.status(400).json({error:e instanceof Error?e.message:"invalid simulation"});}});

router.get("/rules",async(req,res)=>{try{const year=Number(req.query.year||2026);const r=await initDb().query("SELECT id,tax_year,code,name,version,source_url,source_reference,parameters FROM tax_rules WHERE tax_year=$1 AND active=true ORDER BY code,version",[year]);res.json({rules:r.rows});}catch{res.status(500).json({error:"failed to load tax rules"});}});

export default router;