import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";

export type Plan = "free"|"pro"|"business";
export type SubscriptionStatus = "trialing"|"active"|"past_due"|"canceled";

export async function ensureSubscription(userId:string){
 const db=initDb();
 const r=await db.query(`INSERT INTO subscriptions(id,user_id,plan,status,trial_ends_at)
 VALUES($1,$2,'free','trialing',now()+interval '7 days')
 ON CONFLICT(user_id) DO UPDATE SET updated_at=now()
 RETURNING *`,[randomUUID(),userId]);
 return r.rows[0];
}

export async function changePlan(userId:string,toPlan:Plan,reason="manual",metadata:Record<string,unknown>={}){
 const db=initDb(); const client=await db.connect();
 try{
   await client.query("BEGIN");
   const current=await client.query("SELECT plan,status FROM subscriptions WHERE user_id=$1 FOR UPDATE",[userId]);
   const from=current.rows[0]?.plan??"free";
   if(!current.rowCount){
     if(toPlan!== "free"){
       await client.query("ROLLBACK");
       throw new Error("payment confirmation required for paid plan activation");
     }
     await client.query(`INSERT INTO subscriptions(id,user_id,plan,status) VALUES($1,$2,$3,'active')`,[randomUUID(),userId,toPlan]);
   } else {
     if(toPlan !== "free" && toPlan !== from){
       const confirmation = await client.query(
         `SELECT id FROM payment_confirmations WHERE user_id=$1 AND plan=$2 AND confirmed_at IS NOT NULL ORDER BY confirmed_at DESC LIMIT 1`,
         [userId, toPlan]
       );
       if(!confirmation.rowCount){
         await client.query("ROLLBACK");
         throw new Error("payment confirmation required before upgrading to paid plan");
       }
     }
     await client.query("UPDATE subscriptions SET plan=$2,status='active',updated_at=now() WHERE user_id=$1",[userId,toPlan]);
   }
   await client.query("UPDATE app_users SET plan=$2,updated_at=now() WHERE id=$1",[userId,toPlan]);
   await client.query("INSERT INTO plan_change_audits(id,user_id,from_plan,to_plan,reason,metadata) VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),userId,from,toPlan,reason,JSON.stringify(metadata)]);
   await client.query("INSERT INTO billing_events(id,user_id,event_type,from_plan,to_plan,metadata) VALUES($1,$2,'plan_changed',$3,$4,$5)",[randomUUID(),userId,from,toPlan,JSON.stringify(metadata)]);
   await client.query("COMMIT"); return {fromPlan:from,toPlan};
 }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}finally{client.release();}
}

export async function recordPaymentConfirmation(
  userId:string,
  companyId:string,
  amount:number,
  plan:Plan,
  webhookId?:string,
  webhookSignature?:string,
  idempotencyKey?:string
){
  const db=initDb(); const client=await db.connect();
  try{
    await client.query("BEGIN");
    const id=randomUUID();
    const key = idempotencyKey ?? randomUUID();
    const r=await client.query(
      `INSERT INTO payment_confirmations(id,user_id,company_id,payment_id,amount,plan,confirmed_at,webhook_id,webhook_signature,idempotency_key)
       VALUES($1,$2,$3,NULL,$4,$5,now(),$6,$7,$8) RETURNING *`,
      [id,userId,companyId,amount,plan,webhookId??null,webhookSignature??null,key]
    );
    await client.query("COMMIT");
    return r.rows[0];
  }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}finally{client.release();}
}

export async function getActivePaymentConfirmation(userId:string,plan:Plan){
  const db=initDb();
  const r=await db.query(
    `SELECT id,plan,confirmed_at FROM payment_confirmations WHERE user_id=$1 AND plan=$2 AND confirmed_at IS NOT NULL ORDER BY confirmed_at DESC LIMIT 1`,
    [userId,plan]
  );
  return r.rows[0] ?? null;
}

export async function startTrial(userId:string,days=7){
 const db=initDb();
 const safeDays=Math.max(1,Math.min(days,30));
 const existing=await db.query("SELECT * FROM subscriptions WHERE user_id=$1",[userId]);
 if(existing.rowCount){
   const current=existing.rows[0];
   if(current.trial_ends_at && new Date(current.trial_ends_at).getTime()>Date.now()) return current;
   throw new Error("trial already used or subscription already exists");
 }
 const r=await db.query(`INSERT INTO subscriptions(id,user_id,plan,status,trial_ends_at)
 VALUES($1,$2,'free','trialing',now()+make_interval(days=>$3)) RETURNING *`,
 [randomUUID(),userId,safeDays]);
 return r.rows[0];
}

export async function cancelAtPeriodEnd(userId:string){
 const db=initDb();
 const r=await db.query(
  "UPDATE subscriptions SET cancel_at_period_end=true,updated_at=now() WHERE user_id=$1 AND status IN ('trialing','active') RETURNING *",
  [userId]
 );
 if(!r.rowCount) throw new Error("active subscription not found");
 await db.query(
  "INSERT INTO billing_events(id,user_id,event_type,from_plan,to_plan,metadata) VALUES($1,$2,'cancel_scheduled',$3,$3,$4)",
  [randomUUID(),userId,r.rows[0].plan,r.rows[0].current_period_end ? JSON.stringify({currentPeriodEnd:r.rows[0].current_period_end}) : "{}"]
 );
 return r.rows[0];
}

export async function resumeSubscription(userId:string){
 const db=initDb();
 const r=await db.query(
  "UPDATE subscriptions SET cancel_at_period_end=false,updated_at=now() WHERE user_id=$1 AND status IN ('trialing','active') RETURNING *",
  [userId]
 );
 if(!r.rowCount) throw new Error("active subscription not found");
 await db.query(
  "INSERT INTO billing_events(id,user_id,event_type,from_plan,to_plan,metadata) VALUES($1,$2,'cancel_reversed',$3,$3,'{}')",
  [randomUUID(),userId,r.rows[0].plan]
 );
 return r.rows[0];
}
