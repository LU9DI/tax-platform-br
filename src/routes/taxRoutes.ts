import { Router } from "express"; import { prepareTaxProfile } from "../services/taxService.js";
const router=Router();
router.post("/profile/validate",(req,res)=>{try{res.json({valid:true,profile:prepareTaxProfile(req.body)});}catch(e){res.status(400).json({valid:false,error:e instanceof Error?e.message:"invalid tax profile"});}});
export default router;
