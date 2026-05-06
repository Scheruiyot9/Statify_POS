-- Migration 14: Link products to a specific tax template
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tax_template_id UUID REFERENCES tax_templates(tax_template_id) ON DELETE SET NULL;
