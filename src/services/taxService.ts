import { TaxProfile, validateTaxProfile } from "../domain/tax.js";

export function prepareTaxProfile(input: TaxProfile): TaxProfile {
  validateTaxProfile(input);
  return input;
}

export type TaxSimulationInput = { base: number; year: number };
export function simulateConsumptionTransition(input: TaxSimulationInput) {
  if (!Number.isFinite(input.base) || input.base < 0) throw new Error("base must be a non-negative number");
  if (input.year !== 2026) throw new Error("only the 2026 transition simulation is enabled");
  return {
    year: 2026,
    informational: true,
    base: input.base,
    cbs: Math.round(input.base * 0.009 * 100) / 100,
    ibs: Math.round(input.base * 0.001 * 100) / 100,
    total: Math.round(input.base * 0.01 * 100) / 100,
    note: "Simulation only; actual treatment depends on the applicable regime, operation, base and accessory obligations."
  };
}