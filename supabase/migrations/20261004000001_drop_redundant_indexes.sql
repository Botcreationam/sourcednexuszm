-- ============================================================================
-- SOURCED NEXUS — INDEX DEDUPLICATION (PERFORMANCE AUDIT, 2026-10-04)
-- ============================================================================
-- PURPOSE: Remove redundant indexes identified in the database performance
-- audit. Each dropped index is the leftmost-prefix duplicate of a wider
-- composite index that already exists, so NO query loses index support:
-- Postgres can use the leading column(s) of a composite index for any
-- filter that the single-column index served.
--
-- AFFECTED TABLES: products, preorders, product_views
-- IMPACT: Dropping an index takes a brief ACCESS EXCLUSIVE lock on the table.
-- At the current catalog size (hundreds of rows, not millions) each drop is
-- instantaneous. Every write (product view insert, preorder insert) also
-- stops maintaining these extra indexes, slightly reducing write overhead.
-- BACKUP: Recommended before any schema change. A simple logical backup:
--   pg_dump -h <host> -U postgres -d postgres -f backup_$(date +%F).sql
--   (or use the Supabase Dashboard scheduled backup feature first.)
-- ROLLBACK: Re-create any of these with the original statements, e.g.
--   create index if not exists idx_products_status on public.products(status);
-- REVIEW: Read-only, non-destructive to data. No table data is modified.

-- 1. products: (status) is a prefix of idx_products_status_date (status, created_at desc)
drop index if exists public.idx_products_status;

-- 2. products: (category) is a prefix of idx_products_cat_status_date (category, status, created_at desc)
drop index if exists public.idx_products_category;

-- 3. products: (is_new_arrival) is a prefix of idx_products_new_arrival_status
drop index if exists public.idx_products_new_arrival;

-- 4. products: (is_popular) is a prefix of idx_products_popular_status
drop index if exists public.idx_products_popular;

-- 5. preorders: (status) is a prefix of idx_preorders_status_date (status, created_at desc)
drop index if exists public.idx_preorders_status;

-- 6. product_views: (user_id) is a prefix of idx_product_views_user_product (user_id, product_id)
--    Note: idx_product_views_user was added in migration 20261004000000 alongside
--    the composite index; only the composite is needed for activity-claim queries.
drop index if exists public.idx_product_views_user;

-- ============================================================================
-- NOTE (no action required): idx_user_profiles_interests (GIN) is declared in
-- two migrations, but `create index if not exists` makes the second a no-op.
-- There is no duplicate index in the database itself.
-- ============================================================================
