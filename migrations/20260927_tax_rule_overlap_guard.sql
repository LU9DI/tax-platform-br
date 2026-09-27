-- Prevent ambiguous tax-rule resolution for the same code.
-- Active effective periods for one rule code must not overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE tax_rules
  ADD CONSTRAINT tax_rules_effective_range_valid
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE tax_rules
  ADD CONSTRAINT tax_rules_active_effective_no_overlap
  EXCLUDE USING gist (
    code WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  )
  WHERE (active);
