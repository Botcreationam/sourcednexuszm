-- ============================================================================
-- SOURCED NEXUS — MIGRATION: SEPARATE PRODUCTS AND CATEGORIES
-- Establishes a proper foreign key relationship between products and categories
-- ============================================================================

-- 1. Ensure all existing distinct product categories actually exist in the categories table
-- This prevents the foreign key constraint from failing on existing data
INSERT INTO public.categories (name, slug)
SELECT DISTINCT category, LOWER(REPLACE(category, ' ', '-'))
FROM public.products
WHERE category NOT IN (SELECT name FROM public.categories)
ON CONFLICT (name) DO NOTHING;

-- 2. Add a foreign key constraint linking products.category to categories.name
-- ON UPDATE CASCADE: If a category name is changed, update all products automatically
-- ON DELETE RESTRICT: Prevent deletion of a category if it has products linked to it
ALTER TABLE public.products
DROP CONSTRAINT IF EXISTS products_category_fkey;

ALTER TABLE public.products
ADD CONSTRAINT products_category_fkey
FOREIGN KEY (category)
REFERENCES public.categories (name)
ON UPDATE CASCADE
ON DELETE RESTRICT;
