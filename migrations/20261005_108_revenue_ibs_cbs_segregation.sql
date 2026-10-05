-- Revenue ledger hardening for the 2027 Simples Nacional RTC transition.
-- Store the regular IBS/CBS amount separately from gross revenue so the
-- calculation layer can derive the Simples revenue base from ledger data.
ALTER TABLE tax_revenues
  ADD COLUMN IF NOT EXISTS regular_ibs_cbs_amount NUMERIC(20,2) NOT NULL DEFAULT 0;

ALTER TABLE tax_revenues
  ADD CONSTRAINT tax_revenues_regular_ibs_cbs_amount_nonnegative
  CHECK (regular_ibs_cbs_amount >= 0);

ALTER TABLE tax_revenues
  ADD CONSTRAINT tax_revenues_regular_ibs_cbs_amount_not_above_amount
  CHECK (regular_ibs_cbs_amount <= amount);
