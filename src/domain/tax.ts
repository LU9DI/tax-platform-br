export type TaxProfile={taxpayerType:"individual"|"accountant"|"business";country:"BR";state?:string;taxYear:number};
export function validateTaxProfile(p:TaxProfile){if(p.country!=="BR")return false;if(!Number.isInteger(p.taxYear)||p.taxYear<2020||p.taxYear>2100)throw new Error("invalid tax year");return true}
