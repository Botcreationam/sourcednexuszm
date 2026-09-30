-- ============================================================================
-- SOURCED NEXUS — PERFORMANCE & FULL-TEXT SEARCH INDEXES MIGRATION
-- Adds high-performance indexing for multi-category products, searches, and preorders
-- ============================================================================

-- 1. Full-Text Search Vector & GIN Index on Products
-- Enables instant keyword searches across name, category, and description
alter table public.products 
add column if not exists search_tsv tsvector generated always as (
    to_tsvector('english', 
        coalesce(name, '') || ' ' || 
        coalesce(category, '') || ' ' || 
        coalesce(description, '') || ' ' || 
        coalesce(price, '')
    )
) stored;

create index if not exists idx_products_search_tsv 
    on public.products using gin(search_tsv);

-- 2. Array GIN Indexes (for querying specific sizes or colors)
create index if not exists idx_products_sizes_gin 
    on public.products using gin(sizes);

create index if not exists idx_products_colors_gin 
    on public.products using gin(colors);

-- 3. Composite Indexes for Catalog Filtering & Sorting
create index if not exists idx_products_cat_status_date 
    on public.products (category, status, created_at desc);

create index if not exists idx_products_status_date 
    on public.products (status, created_at desc);

create index if not exists idx_products_new_arrival_status 
    on public.products (is_new_arrival, status, created_at desc);

create index if not exists idx_products_popular_status 
    on public.products (is_popular, status, created_at desc);

-- 4. Preorders / Sourcing Requests Indexes
create index if not exists idx_preorders_customer 
    on public.preorders (customer_name text_pattern_ops);

create index if not exists idx_preorders_whatsapp 
    on public.preorders (whatsapp);

create index if not exists idx_preorders_category 
    on public.preorders (category);

create index if not exists idx_preorders_status_date 
    on public.preorders (status, created_at desc);

-- 5. Categories Indexes
create index if not exists idx_categories_display_order 
    on public.categories (display_order asc);

create index if not exists idx_categories_slug 
    on public.categories (slug);
