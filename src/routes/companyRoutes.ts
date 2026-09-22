import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();
router.post("/",requireAuth,async(req,res)=>{try{const {legalName,cnpj,regime="mei",state,city,activity,openedAt}=req.body||{};if(!legalName?.trim())return res.status(400).json({error:"legalName is required"});if(!["mei","simples","other"].includes(regime))return res.status(400).json({error:"invalid regime"});const id=randomUUID();await initDb().query("INSERT INTO tax_companies (id,user_id,legal_name,cnpj,regime,state,city,activity,opened_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id,(req as any).userId,legalName.trim(),cnpj||null,regime,state||null,city||null,activity||null,openedAt||null]);res.status(201).json({id,legalName:legalName.trim(),cnpj:cnpj||null,regime,state:state||null,city:city||null,activity:activity||null});}catch{res.status(400).json({error:"failed to create company"});}});
router.get("/",requireAuth,async(req,res)=>{try{const r=await initDb().query("SELECT id,legal_name,cnpj,regime,state,city,activity,opened_at,created_at,updated_at FROM tax_companies WHERE user_id=$1 ORDER BY updated_at DESC",[(req as any).userId]);res.json({companies:r.rows});}catch{res.status(500).json({error:"failed to load companies"});}});
export default router;