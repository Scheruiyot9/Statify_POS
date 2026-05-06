-- =============================================================================
-- 09_product_images.sql
-- Adds optional image_url to products for display in the POS product grid
-- and cart thumbnails.
-- =============================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url TEXT;
