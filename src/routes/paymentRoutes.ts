import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AMOUNT=1_000_000_000;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_PAYMENTS_PER_DAY=500;
router.post("/:companyId",requireAuth,async(req,res)=>{try{
 if(!UUID.test(String(req.params.companyId)))return res.status(400).json({error:"invalid company id"});
 const amount=Number(req.body?.amount);if(!Number.isFinite(amount)||amount<0||amount>MAX_AMOUNT)return res.status(400).json({error:"invalid amount"});
 const referenceMonth=req.body?.referenceMonth;if(typeof referenceMonth!=="string"||!MONTH.test(referenceMonth))return res.status(400).json({error:"invalid reference month"});
 const taxCode=req.body?.taxCode;if(taxCode!==undefined&&taxCode!==null&&(typeof taxCode!=="string"||taxCode.length>80))return res.status(400).json({error:"invalid tax code"});
 const paidAt=req.body?.paidAt;if(paidAt!==undefined&&paidAt!==null&&(typeof paidAt!=="string"||Number.isNaN(Date.parse(paidAt))))return res.status(400).json({error:"invalid paid date"});
 const rawKey=req.header("idempotency-key");const key=rawKey?.trim();if(!key||key.length>200)return res.status(400).json({error:"idempotency-key is required"});
 const db=initDb();const userId=(req as any).userId;const client=await db.connect();await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[String(userId)+":payments"]);const daily=await client.query("SELECT COUNT(*)::int count FROM tax_payments p JOIN tax_companies c ON c.id=p.company_id WHERE c.user_id=$1 AND p.created_at >= now()-interval '24 hours'",[userId]);if(Number(daily.rows[0].count)>=MAX_PAYMENTS_PER_DAY){await client.query("ROLLBACK");client.release();return res.status(429).json({error:"daily payment limit reached",limit:MAX_PAYMENTS_PER_DAY});}
 const c=await client.query("SELECT id FROM tax_companies WHERE id=$1 AND user_id=$2",[req.params.companyId,userId]);if(!c.rowCount){await client.query("ROLLBACK");client.release();return res.status(404).json({error:"company not found"});}
 const existing=await client.query("SELECT id,amount FROM tax_payments WHERE company_id=$1 AND idempotency_key=$2 LIMIT 1",[req.params.companyId,key]);if(existing.rowCount){await client.query("ROLLBACK");client.release();return res.status(200).json({id:existing.rows[0].id,amount:Number(existing.rows[0].amount),duplicate:true});}
 const id=randomUUID();
 try{await client.query("INSERT INTO tax_payments (id,company_id,reference_month,amount,tax_code,paid_at,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)",[id,req.params.companyId,referenceMonth,amount,taxCode??null,paidAt??null,key]);await client.query("COMMIT");client.release();}
 catch(e){if((e as any)?.code==="23505"){await client.query("ROLLBACK").catch(()=>{});const duplicate=await db.query("SELECT id,amount FROM tax_payments WHERE company_id=$1 AND idempotency_key=$2 LIMIT 1",[req.params.companyId,key]);client.release();if(duplicate.rowCount)return res.status(200).json({id:duplicate.rows[0].id,amount:Number(duplicate.rows[0].amount),duplicate:true});}throw e;}
 res.status(201).json({id,amount,duplicate:false});
}catch{await client.query("ROLLBACK").catch(()=>{});client.release();res.status(400).json({error:"failed to save payment"});}});
export default router;