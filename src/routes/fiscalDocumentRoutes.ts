import { Router } from "express";
import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { requireAuth } from "../middleware/auth.js";

const router=Router();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ownedCompany(companyId:string,userId:string){
  const r=await initDb().query("SELECT id FROM tax_companies WHERE id=$1 AND user_id=$2",[companyId,userId]);
  return !!r.rowCount;
}

router.post("/:companyId",requireAuth,async(req,res)=>{
  try{
    const companyId=String(req.params.companyId),userId=String((req as any).userId);
    if(!UUID.test(companyId))return res.status(400).json({error:"invalid company id"});
    if(!(await ownedCompany(companyId,userId)))return res.status(404).json({error:"company not found"});
    const b=req.body??{},documentType=typeof b.documentType==="string"&&b.documentType.trim()?b.documentType.trim():null,issuedAt=typeof b.issuedAt==="string"?b.issuedAt:null;
    const totalAmount=Number(b.totalAmount),revenueAmount=Number(b.revenueAmount??b.totalAmount),regularIbsCbsAmount=Number(b.regularIbsCbsAmount??0);
    if(!documentType||!issuedAt||Number.isNaN(Date.parse(issuedAt)))return res.status(400).json({error:"invalid document type or issuedAt"});
    if(!Number.isFinite(totalAmount)||totalAmount<0||!Number.isFinite(revenueAmount)||revenueAmount<0||revenueAmount>totalAmount)return res.status(400).json({error:"invalid document amounts"});
    if(!Number.isFinite(regularIbsCbsAmount)||regularIbsCbsAmount<0||regularIbsCbsAmount>revenueAmount)return res.status(400).json({error:"invalid regularIbsCbsAmount"});
    const status=b.status??"active",classificationStatus=b.classificationStatus??"pending";
    if(!["active","cancelled"].includes(status))return res.status(400).json({error:"invalid status"});
    if(!["pending","classified","rejected"].includes(classificationStatus))return res.status(400).json({error:"invalid classificationStatus"});
    const classificationRuleVersionId=b.classificationRuleVersionId??null;
    if(classificationStatus==="classified"&&(typeof classificationRuleVersionId!=="string"||!UUID.test(classificationRuleVersionId)))return res.status(400).json({error:"classified document requires classificationRuleVersionId"});
    if(classificationRuleVersionId){const rr=await initDb().query("SELECT id FROM tax_rules WHERE id=$1",[classificationRuleVersionId]);if(!rr.rowCount)return res.status(400).json({error:"classification rule version not found"});}
    const r=await initDb().query(`INSERT INTO tax_fiscal_documents
      (id,company_id,document_type,access_key,document_number,series,issued_at,total_amount,revenue_amount,regular_ibs_cbs_amount,status,classification_status,classification_code,classification_basis,classification_rule_version_id,source,external_id,raw_data)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [randomUUID(),companyId,documentType,b.accessKey??null,b.documentNumber??null,b.series??null,issuedAt,totalAmount,revenueAmount,regularIbsCbsAmount,status,classificationStatus,b.classificationCode??null,b.classificationBasis??null,classificationRuleVersionId,b.source??"fiscal_document",b.externalId??null,JSON.stringify(b.rawData??{})]);
    res.status(201).json({ok:true,document:r.rows[0]});
  }catch(e){if(String(e).includes("duplicate key"))return res.status(409).json({error:"fiscal document already exists"});res.status(400).json({error:"failed to save fiscal document"});}
});

router.post("/:companyId/:documentId/cancel",requireAuth,async(req,res)=>{
  try{
    const companyId=String(req.params.companyId),documentId=String(req.params.documentId);
    if(!UUID.test(companyId)||!UUID.test(documentId))return res.status(400).json({error:"invalid id"});
    if(!(await ownedCompany(companyId,String((req as any).userId))))return res.status(404).json({error:"company not found"});
    const r=await initDb().query("UPDATE tax_fiscal_documents SET status='cancelled' WHERE id=$1 AND company_id=$2 AND status='active' RETURNING id,status",[documentId,companyId]);
    if(!r.rowCount)return res.status(404).json({error:"active fiscal document not found"});
    res.json({ok:true,document:r.rows[0]});
  }catch{res.status(400).json({error:"failed to cancel fiscal document"});}
});

router.post("/:companyId/:documentId/rectify",requireAuth,async(req,res)=>{
  try{
    const companyId=String(req.params.companyId),documentId=String(req.params.documentId),userId=String((req as any).userId);
    if(!UUID.test(companyId)||!UUID.test(documentId))return res.status(400).json({error:"invalid id"});
    if(!(await ownedCompany(companyId,userId)))return res.status(404).json({error:"company not found"});
    const old=await initDb().query("SELECT * FROM tax_fiscal_documents WHERE id=$1 AND company_id=$2 AND status='active'",[documentId,companyId]);
    if(!old.rowCount)return res.status(404).json({error:"active fiscal document not found"});
    const b=req.body??{},revenueAmount=Number(b.revenueAmount??old.rows[0].revenue_amount),totalAmount=Number(b.totalAmount??old.rows[0].total_amount),regular=Number(b.regularIbsCbsAmount??old.rows[0].regular_ibs_cbs_amount);
    if(!Number.isFinite(totalAmount)||!Number.isFinite(revenueAmount)||!Number.isFinite(regular)||revenueAmount<0||revenueAmount>totalAmount||regular<0||regular>revenueAmount)return res.status(400).json({error:"invalid rectified amounts"});
    const db=initDb();await db.query("BEGIN");
    try{
      const r=await db.query(`INSERT INTO tax_fiscal_documents
        (id,company_id,document_type,access_key,document_number,series,issued_at,total_amount,revenue_amount,regular_ibs_cbs_amount,status,classification_status,classification_code,classification_basis,classification_rule_version_id,source,external_id,raw_data,supersedes_document_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12,$13,$14,$15,$16,$17,$18)`,
        [randomUUID(),companyId,old.rows[0].document_type,b.accessKey??old.rows[0].access_key,b.documentNumber??old.rows[0].document_number,b.series??old.rows[0].series,b.issuedAt??old.rows[0].issued_at,totalAmount,revenueAmount,regular,b.classificationStatus??"pending",b.classificationCode??null,b.classificationBasis??null,b.classificationRuleVersionId??null,b.source??"fiscal_document",b.externalId??null,JSON.stringify(b.rawData??old.rows[0].raw_data),documentId]);
      await db.query("UPDATE tax_fiscal_documents SET status='rectified',rectified_by_document_id=$1 WHERE id=$2",[r.rows[0].id,documentId]);
      await db.query("COMMIT");res.status(201).json({ok:true,document:r.rows[0],supersedesDocumentId:documentId});
    }catch(e){await db.query("ROLLBACK");throw e;}
  }catch{res.status(400).json({error:"failed to rectify fiscal document"});}
});

router.get("/:companyId",requireAuth,async(req,res)=>{
  try{
    const companyId=String(req.params.companyId);if(!UUID.test(companyId))return res.status(400).json({error:"invalid company id"});
    if(!(await ownedCompany(companyId,String((req as any).userId))))return res.status(404).json({error:"company not found"});
    const limit=Math.min(Math.max(Number(req.query.limit??50),1),100);
    const r=await initDb().query("SELECT id,document_type,access_key,document_number,series,issued_at,total_amount,revenue_amount,regular_ibs_cbs_amount,status,classification_status,classification_code,classification_basis,classification_rule_version_id,source,external_id,supersedes_document_id,rectified_by_document_id,created_at,updated_at FROM tax_fiscal_documents WHERE company_id=$1 ORDER BY issued_at DESC LIMIT $2",[companyId,limit]);
    res.json({documents:r.rows});
  }catch{res.status(500).json({error:"failed to load fiscal documents"});}
});

router.post("/:companyId/reconcile-revenue",requireAuth,async(req,res)=>{
  try{
    const companyId=String(req.params.companyId),userId=String((req as any).userId),period=typeof req.body?.period==="string"?req.body.period:"";
    if(!UUID.test(companyId)||!/^d{4}-(0[1-9]|1[0-2])$/.test(period))return res.status(400).json({error:"invalid company id or period"});
    if(!(await ownedCompany(companyId,userId)))return res.status(404).json({error:"company not found"});
    const r=await initDb().query(`SELECT COALESCE(SUM(revenue_amount),0)::numeric gross_revenue,COALESCE(SUM(regular_ibs_cbs_amount),0)::numeric regular_ibs_cbs,COUNT(*)::int document_count
      FROM tax_fiscal_documents WHERE company_id=$1 AND status='active' AND classification_status='classified' AND to_char(issued_at AT TIME ZONE 'UTC','YYYY-MM')=$2`,[companyId,period]);
    const row=r.rows[0],db=initDb(),id=(await db.query("SELECT id FROM tax_revenues WHERE company_id=$1 AND reference_month=$2",[companyId,period+"-01"])).rows[0]?.id??randomUUID();
    await db.query(`INSERT INTO tax_revenues(id,company_id,reference_month,amount,regular_ibs_cbs_amount,source,notes,revenue_basis,fiscal_document_count)
      VALUES($1,$2,$3,$4,$5,'fiscal_documents',$6,'fiscal_documents',$7)
      ON CONFLICT(company_id,reference_month) DO UPDATE SET amount=EXCLUDED.amount,regular_ibs_cbs_amount=EXCLUDED.regular_ibs_cbs_amount,source='fiscal_documents',notes=EXCLUDED.notes,revenue_basis='fiscal_documents',fiscal_document_count=EXCLUDED.fiscal_document_count`,
      [id,companyId,period+"-01",row.gross_revenue,row.regular_ibs_cbs,`Reconciled from ${row.document_count} classified active fiscal documents`,row.document_count]);
    res.json({ok:true,period,grossRevenue:Number(row.gross_revenue),regularIbsCbsAmount:Number(row.regular_ibs_cbs),fiscalDocumentCount:Number(row.document_count),revenueBasis:"fiscal_documents"});
  }catch{res.status(400).json({error:"failed to reconcile fiscal documents"});}
});

export default router;
