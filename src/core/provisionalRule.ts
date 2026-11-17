export type ProvisionalRuleInfo = {
  isProvisional: boolean;
  warning?: string;
  confirmationPending?: boolean;
};

export function getProvisionalRuleInfo(
  ruleCode: string,
  parameters: unknown,
): ProvisionalRuleInfo {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return { isProvisional: false };
  }
  const p = parameters as Record<string, unknown>;
  const isProvisional = p.status === "provisorio" || p.confirmacao_2027_pendente === true;
  const result: ProvisionalRuleInfo = { isProvisional };
  if (isProvisional) {
    result.warning = `A regra ${ruleCode} usa parametros PROVISORIOS (baseline de 2026) que ainda nao foram confirmados por ato normativo para 2027. Nao use esses valores como regras fiscais oficiais.`;
    result.confirmationPending = true;
  }
  return result;
}