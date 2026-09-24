import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
export async function recordTaxCalculation(companyId:string,userId:string,type:string,input:unknown,output:unknown,ruleVersionId?:string){
 const own=await initDb().query("SELECT id FROM tax_companies WHERE id=$1 AND user_id=$2",[companyId,userId]);
 if(!own.rowCount) return null;
 const r=await initDb().query("INSERT INTO tax_calculation_audits(id,company_id,calculation_type,input,output,rule_version_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[randomUUID(),companyId,type,JSON.stringify(input),JSON.stringify(output),ruleVersionId??null]);
 return r.rows[0];
}