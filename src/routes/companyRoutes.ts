import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";
const router=Router();
const regimes=new Set(["mei","simples","other"]);
const MAX_TEXT=200;
const parseLimit=(v:unknown)=>{const n=Number(v??20);return Number.isInteger(n)&&n>=1&&n<=100?n:20;};
const parseOffset=(v:unknown)=>{const n=Number(v??0);return Number.isInteger(n)&&n>=0&&n<=100000?n:0;};
function text(v:unknown,max=MAX_TEXT){if(typeof v!=="string")return null;const s=v.trim();return s?s.slice(0,max):null;}
function isoDate(v:unknown){if(v==null||v==="")return null;if(typeof v!=="string"||!/^(\d{4})-(\d{2})-(\d{2})$/.test(v))return null;const [,y,m,d]=v.match(/^(\d{4})-(\d{2})-(\d{2})$/)!;const dt=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));return dt.getUTCFullYear()===Number(y)&&dt.getUTCMonth()+1===Number(m)&&dt.getUTCDate()===Number(d)?v:null;}
router.post("/",requireAuth,async(req,res)=>{try{
 const b=req.body||{},legalName=text(b.legalName);if(!legalName||legalName.length>200)return res.status(400).json({error:"invalid legalName"});
 const cnpj=b.cnpj==null?null:text(b.cnpj,32);const regime=String(b.regime||"mei").toLowerCase();if(!regimes.has(regime))return res.status(400).json({error:"invalid regime"});
 const state=b.state==null?null:text(b.state,80),city=b.city==null?null:text(b.city,120),activity=b.activity==null?null:text(b.activity,200);const openedAt=isoDate(b.openedAt);if(b.openedAt!=null&&!openedAt)return res.status(400).json({error:"invalid openedAt"});
 const id=randomUUID();await initDb().query("INSERT INTO tax_companies (id,user_id,legal_name,cnpj,regime,state,city,activity,opened_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id,(req as any).userId,legalName,cnpj,regime,state,city,activity,openedAt]);res.status(201).json({id,legalName,cnpj,regime,state,city,activity});
}catch{res.status(400).json({error:"failed to create company"});}});
router.get("/",requireAuth,async(req,res)=>{try{const limit=parseLimit(req.query.limit),offset=parseOffset(req.query.offset),db=initDb();const r=await db.query("SELECT id,legal_name,cnpj,regime,state,city,activity,opened_at,created_at,updated_at FROM tax_companies WHERE user_id=$1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3",[(req as any).userId,limit,offset]);const count=await db.query("SELECT COUNT(*)::int count FROM tax_companies WHERE user_id=$1",[(req as any).userId]);res.json({companies:r.rows,pagination:{limit,offset,total:Number(count.rows[0].count),hasMore:offset+r.rows.length<Number(count.rows[0].count)}});}catch{res.status(500).json({error:"failed to load companies"});}});
export default router;