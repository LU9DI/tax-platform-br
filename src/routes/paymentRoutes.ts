import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AMOUNT=1_000_000_000;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_PAYMENTS_PER_DAY=500;

function normalizePaidAt(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return new Date(value).toISOString().slice(0,10);
}

function paymentFingerprint(companyId: string, referenceMonth: string, amount: number, taxCode: string | null, paidAt: string | null): string {
  const canonical = [companyId, referenceMonth, amount.toFixed(2), taxCode ?? "", paidAt ?? ""].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

router.post("/:companyId",requireAuth,async(req,res)=>{
 let client:any=null;
 try{
  if(!UUID.test(String(req.params.companyId)))return res.status(400).json({error:"invalid company id"});
  const amount=Number(req.body?.amount);if(!Number.isFinite(amount)||amount<0||amount>MAX_AMOUNT)return res.status(400).json({error:"invalid amount"});
  const referenceMonth=req.body?.referenceMonth;if(typeof referenceMonth!=="string"||!MONTH.test(referenceMonth))return res.status(400).json({error:"invalid reference month"});
  const taxCode=req.body?.taxCode;if(taxCode!==undefined&&taxCode!==null&&(typeof taxCode!=="string"||taxCode.length>80))return res.status(400).json({error:"invalid tax code"});
  const paidAtRaw=req.body?.paidAt;if(paidAtRaw!==undefined&&paidAtRaw!==null&&(typeof paidAtRaw!=="string"||Number.isNaN(Date.parse(paidAtRaw))))return res.status(400).json({error:"invalid paid date"});
  const paidAt=normalizePaidAt(paidAtRaw);
  const key=req.header("idempotency-key")?.trim();if(!key||key.length>200)return res.status(400).json({error:"idempotency-key is required"});
  const fingerprint=paymentFingerprint(String(req.params.companyId),referenceMonth,amount,taxCode??null,paidAt);
  const db=initDb();const userId=(req as any).userId;
  client=await db.connect();await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[String(userId)+":payments"]);
  const company=await client.query("SELECT id FROM tax_companies WHERE id=$1 AND user_id=$2",[req.params.companyId,userId]);
  if(!company.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"company not found"});}
  const existing=await client.query("SELECT id,amount,request_fingerprint FROM tax_payments WHERE company_id=$1 AND idempotency_key=$2 LIMIT 1",[req.params.companyId,key]);
  if(existing.rowCount){
   if(existing.rows[0].request_fingerprint!==fingerprint){
    await client.query("ROLLBACK");
    return res.status(409).json({error:"idempotency-key was already used with a different payment payload"});
   }
   await client.query("COMMIT");
   return res.status(200).json({id:existing.rows[0].id,amount:Number(existing.rows[0].amount),duplicate:true});
  }
  const daily=await client.query("SELECT COUNT(*)::int count FROM tax_payments p JOIN tax_companies c ON c.id=p.company_id WHERE c.user_id=$1 AND p.created_at >= now()-interval '24 hours'",[userId]);
  if(Number(daily.rows[0].count)>=MAX_PAYMENTS_PER_DAY){await client.query("ROLLBACK");return res.status(429).json({error:"daily payment limit reached",limit:MAX_PAYMENTS_PER_DAY});}
  const id=randomUUID();
  try{
   await client.query("INSERT INTO tax_payments (id,company_id,reference_month,amount,tax_code,paid_at,idempotency_key,request_fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",[id,req.params.companyId,referenceMonth,amount,taxCode??null,paidAt,key,fingerprint]);
   await client.query("COMMIT");
   return res.status(201).json({id,amount,duplicate:false});
  }catch(e:any){
   await client.query("ROLLBACK").catch(()=>{});
   if(e?.code==="23505"){
    const duplicate=await db.query("SELECT id,amount,request_fingerprint FROM tax_payments WHERE company_id=$1 AND idempotency_key=$2 LIMIT 1",[req.params.companyId,key]);
    if(duplicate.rowCount){
     if(duplicate.rows[0].request_fingerprint!==fingerprint)return res.status(409).json({error:"idempotency-key was already used with a different payment payload"});
     return res.status(200).json({id:duplicate.rows[0].id,amount:Number(duplicate.rows[0].amount),duplicate:true});
    }
   }
   return res.status(400).json({error:"failed to save payment"});
  }
 }catch{
  if(client)await client.query("ROLLBACK").catch(()=>{});
  return res.status(400).json({error:"failed to save payment"});
 }finally{if(client)client.release();}
});
export default router;
