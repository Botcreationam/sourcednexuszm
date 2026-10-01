-- ============================================================================
-- SOURCED NEXUS — PRODUCT SOCIAL METRICS & REVIEWS MIGRATION
-- Adds support for real likes, views, ratings, reviews, and comments
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PRODUCT METRICS TABLE (Aggregates)
-- ----------------------------------------------------------------------------
create table if not exists public.product_metrics (
    product_id uuid primary key references public.products(id) on delete cascade,
    view_count integer not null default 0,
    like_count integer not null default 0,
    review_count integer not null default 0,
    average_rating numeric(3,2) not null default 0.00,
    updated_at timestamptz not null default now()
);

-- Ensure all existing products have a metrics row
insert into public.product_metrics (product_id)
select id from public.products
on conflict (product_id) do nothing;

-- Function to auto-create metrics for new products
create or replace function public.handle_new_product_metrics()
returns trigger as $$
begin
    insert into public.product_metrics (product_id) values (new.id);
    return new;
end;
$$ language plpgsql;

drop trigger if exists on_product_created_metrics on public.products;
create trigger on_product_created_metrics
    after insert on public.products
    for each row
    execute function public.handle_new_product_metrics();

-- ----------------------------------------------------------------------------
-- 2. PRODUCT LIKES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.product_likes (
    user_id uuid references auth.users(id) on delete cascade,
    product_id uuid references public.products(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, product_id)
);

create index if not exists idx_product_likes_product on public.product_likes(product_id);

-- Update like_count trigger
create or replace function public.handle_like_count_update()
returns trigger as $$
begin
    if tg_op = 'INSERT' then
        update public.product_metrics set like_count = like_count + 1 where product_id = new.product_id;
    elsif tg_op = 'DELETE' then
        update public.product_metrics set like_count = greatest(0, like_count - 1) where product_id = old.product_id;
    end if;
    return null;
end;
$$ language plpgsql;

drop trigger if exists on_like_update on public.product_likes;
create trigger on_like_update
    after insert or delete on public.product_likes
    for each row
    execute function public.handle_like_count_update();

-- ----------------------------------------------------------------------------
-- 3. PRODUCT VIEWS (For unique counting)
-- ----------------------------------------------------------------------------
create table if not exists public.product_views (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    session_id text not null,
    created_at timestamptz not null default now(),
    unique(product_id, session_id) -- Prevents duplicate counting from same session
);

-- Update view_count trigger
create or replace function public.handle_view_count_update()
returns trigger as $$
begin
    if tg_op = 'INSERT' then
        update public.product_metrics set view_count = view_count + 1 where product_id = new.product_id;
    end if;
    return null;
end;
$$ language plpgsql;

drop trigger if exists on_view_insert on public.product_views;
create trigger on_view_insert
    after insert on public.product_views
    for each row
    execute function public.handle_view_count_update();

-- ----------------------------------------------------------------------------
-- 4. PRODUCT REVIEWS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.product_reviews (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    rating integer not null check (rating >= 1 and rating <= 5),
    review_text text,
    status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(product_id, user_id) -- One review per user per product
);

create index if not exists idx_product_reviews_product on public.product_reviews(product_id);

-- Update average rating trigger
create or replace function public.handle_review_metrics_update()
returns trigger as $$
declare
    v_avg numeric(3,2);
    v_count integer;
    v_prod uuid;
begin
    v_prod := coalesce(new.product_id, old.product_id);
    
    -- Calculate new average and count only for approved reviews
    select count(*), coalesce(avg(rating), 0)
    into v_count, v_avg
    from public.product_reviews
    where product_id = v_prod and status = 'approved';
    
    update public.product_metrics 
    set review_count = v_count, average_rating = v_avg, updated_at = now()
    where product_id = v_prod;
    
    return null;
end;
$$ language plpgsql;

drop trigger if exists on_review_update on public.product_reviews;
create trigger on_review_update
    after insert or update or delete on public.product_reviews
    for each row
    execute function public.handle_review_metrics_update();

-- ----------------------------------------------------------------------------
-- 5. PRODUCT COMMENTS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.product_comments (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    parent_id uuid references public.product_comments(id) on delete cascade,
    content text not null,
    status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_product_comments_product on public.product_comments(product_id);
create index if not exists idx_product_comments_parent on public.product_comments(parent_id);

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
alter table public.product_metrics enable row level security;
alter table public.product_likes enable row level security;
alter table public.product_views enable row level security;
alter table public.product_reviews enable row level security;
alter table public.product_comments enable row level security;

-- Metrics: Public read, no direct insert/update/delete (handled by triggers)
create policy "Allow public read on product_metrics" on public.product_metrics for select using (true);

-- Likes: Users can read all, insert/delete their own
create policy "Allow public read on product_likes" on public.product_likes for select using (true);
create policy "Users can insert own likes" on public.product_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can delete own likes" on public.product_likes for delete to authenticated using (auth.uid() = user_id);

-- Views: Public insert, public read
create policy "Allow public insert on product_views" on public.product_views for insert with check (true);
create policy "Allow public read on product_views" on public.product_views for select using (true);

-- Reviews: Public read approved, users read their own, users insert/update own, admin all
create policy "Public read approved reviews" on public.product_reviews for select using (status = 'approved' or auth.uid() = user_id or public.is_admin());
create policy "Users insert own reviews" on public.product_reviews for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own reviews" on public.product_reviews for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own reviews" on public.product_reviews for delete to authenticated using (auth.uid() = user_id);
create policy "Admin manage reviews" on public.product_reviews for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Comments: Public read approved, users read their own, users insert/update own, admin all
create policy "Public read approved comments" on public.product_comments for select using (status = 'approved' or auth.uid() = user_id or public.is_admin());
create policy "Users insert own comments" on public.product_comments for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own comments" on public.product_comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own comments" on public.product_comments for delete to authenticated using (auth.uid() = user_id);
create policy "Admin manage comments" on public.product_comments for all to authenticated using (public.is_admin()) with check (public.is_admin());
