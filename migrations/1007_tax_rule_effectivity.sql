ALTER TABLE tax_rules ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE tax_rules ADD COLUMN IF NOT EXISTS effective_to DATE;
CREATE INDEX IF NOT EXISTS idx_tax_rules_effective ON tax_rules(code,effective_from,effective_to);
