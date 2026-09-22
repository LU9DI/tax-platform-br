import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();
router.post("/:companyId",requireAuth,async(req,res)=>{try{const amount=Number(req.body?.amount);if(!Number.isFinite(amount)||amount<0)return res.status(400).json({error:"amount must be non-negative"});const c=await initDb().query("SELECT id FROM tax_companies WHERE id=$1 AND user_id=$2",[req.params.companyId,(req as any).userId]);if(!c.rowCount)return res.status(404).json({error:"company not found"});const id=randomUUID();await initDb().query("INSERT INTO tax_payments (id,company_id,reference_month,amount,tax_code,paid_at) VALUES ($1,$2,$3,$4,$5,$6)",[id,req.params.companyId,req.body?.referenceMonth,amount,req.body?.taxCode||null,req.body?.paidAt||null]);res.status(201).json({id,amount});}catch{res.status(400).json({error:"failed to save payment"});}});
export default router;