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
router.patch("/:id",requireAuth,async(req,res)=>{try{const id=String(req.params.id),b=req.body||{};const legalName=text(b.legalName);if(!legalName||!id)return res.status(400).json({error:"invalid company"});const cnpj=b.cnpj==null?null:text(b.cnpj,32),regime=String(b.regime||"mei").toLowerCase();if(!regimes.has(regime))return res.status(400).json({error:"invalid regime"});const state=b.state==null?null:text(b.state,80),city=b.city==null?null:text(b.city,120),activity=b.activity==null?null:text(b.activity,200),openedAt=isoDate(b.openedAt);if(b.openedAt!=null&&!openedAt)return res.status(400).json({error:"invalid openedAt"});const r=await initDb().query("UPDATE tax_companies SET legal_name=$1,cnpj=$2,regime=$3,state=$4,city=$5,activity=$6,opened_at=$7,updated_at=now() WHERE id=$8 AND user_id=$9 RETURNING id,legal_name,cnpj,regime,state,city,activity,opened_at,created_at,updated_at",[legalName,cnpj,regime,state,city,activity,openedAt,id,(req as any).userId]);if(!r.rowCount)return res.status(404).json({error:"company not found"});res.json({company:r.rows[0]});}catch{res.status(400).json({error:"failed to update company"});}});
router.delete("/:id",requireAuth,async(req,res)=>{try{const r=await initDb().query("DELETE FROM tax_companies WHERE id=$1 AND user_id=$2",[String(req.params.id),(req as any).userId]);if(!r.rowCount)return res.status(404).json({error:"company not found"});res.status(204).end();}catch{res.status(500).json({error:"failed to delete company"});}});

export default router;