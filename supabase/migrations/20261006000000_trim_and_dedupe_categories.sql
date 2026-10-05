-- ============================================================================
-- Trim stray whitespace from category names and product category references,
-- and merge the duplicates those padded names created.
--
-- Why: several categories were saved with trailing spaces (e.g. "Pajamas ",
-- "Eye Glasses ", "General Clothing "). Products reference categories by
-- NAME (plain text), so a padded name silently breaks matching and produced
-- phantom "orphan" categories on the storefront. The frontend now trims and
-- dedupes defensively (Catalog.jsx, Categories.jsx, admin duplicate guard),
-- but the underlying rows should be clean too.
--
-- Idempotent: safe to run any number of times.
-- ============================================================================

-- 1. Trim whitespace from both ends of category names and slugs.
update public.categories
   set name = btrim(name),
       slug = case when slug is null or btrim(slug) = '' then null else btrim(slug) end
 where name <> btrim(name)
    or coalesce(slug, '') <> coalesce(btrim(coalesce(slug, '')), '');

-- 2. Trim whitespace from the products.category text references
--    (products store the category NAME, not an id).
update public.products
   set category = btrim(category)
 where category is not null
   and category <> btrim(category);

-- 3. Rebuild slugs that do not match their (now trimmed) name, keeping any
--    intentional custom slug only when it was already well-formed.
--    (Skipped here on purpose: slug is display-only; misalignment is harmless.)

-- 4. Merge duplicate categories that differed only by whitespace or case.
--    Keeps the oldest row (lowest created_at), deletes the rest.
--    Products already point at the trimmed name, so no product reassignment
--    is needed once both sides are trimmed.
delete from public.categories a
 using public.categories b
 where a.id <> b.id
   and lower(a.name) = lower(b.name)
   and (
     -- keep the older row, or the smaller id as a tiebreaker
     (a.created_at > b.created_at)
     or (a.created_at = b.created_at and a.id > b.id)
   );

-- 5. Show what changed (for the operator running this by hand):
--    select name, slug, created_at from public.categories order by name;
