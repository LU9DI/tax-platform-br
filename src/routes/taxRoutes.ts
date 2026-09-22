import { Router } from "express";
import { validateTaxProfile } from "../domain/tax.js";
const router=Router();
router.post("/profile/validate",(req,res)=>{try{validateTaxProfile(req.body);res.json({valid:true});}catch(error){res.status(400).json({valid:false,error:error instanceof Error?error.message:"invalid tax profile"});}});
export default router;
