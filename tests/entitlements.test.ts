import test from "node:test";
import assert from "node:assert/strict";
import { assertEntitlement, type Entitlement } from "../src/core/platformGovernance.js";
const e=(plan:string,limit:number|null,allowed=true):Entitlement=>({plan,limit,allowed});
test("plan entitlement matrix enforces company limits",()=>{assert.doesNotThrow(()=>assertEntitlement(e("free",3),"companies",2));assert.throws(()=>assertEntitlement(e("free",3),"companies",3),/limit reached/);assert.doesNotThrow(()=>assertEntitlement(e("pro",50),"companies",49));assert.throws(()=>assertEntitlement(e("pro",50),"companies",50),/limit reached/);assert.doesNotThrow(()=>assertEntitlement(e("business",500),"companies",499));assert.throws(()=>assertEntitlement(e("business",500),"companies",500),/limit reached/);});
test("disabled entitlement is denied",()=>{assert.throws(()=>assertEntitlement(e("free",0,false),"advanced_analytics",0),/feature disabled/);});
