import { validateTaxProfile,type TaxProfile } from "../domain/tax.js";
export function prepareTaxProfile(p:TaxProfile){validateTaxProfile(p);return p;}
