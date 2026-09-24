import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
export async function getEffectiveTaxRule(ruleCode:string,at=new Date()){
 const r=await initDb().query(`SELECT * FROM tax_rule_versions WHERE rule_code=$1 AND effective_from<=($2::timestamptz)::date AND (effective_to IS NULL OR effective_to>=($2::timestamptz)::date) ORDER BY version DESC LIMIT 1`,[ruleCode,at.toISOString()]);
 return r.rows[0]??null;
}
export async function recordTaxCalculation(companyId:string,userId:string,type:string,input:unknown,output:unknown,ruleVersionId?:string){
 const own=await initDb().query("SELECT id FROM tax_companies WHERE id=$1 AND user_id=$2",[companyId,userId]);
 if(!own.rowCount)return null;
 const r=await initDb().query("INSERT INTO tax_calculation_audits(id,company_id,calculation_type,input,output,rule_version_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[randomUUID(),companyId,type,JSON.stringify(input),JSON.stringify(output),ruleVersionId??null]);
 return r.rows[0];
}
