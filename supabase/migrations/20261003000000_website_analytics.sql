-- ============================================================================
-- SOURCED NEXUS — WEBSITE ANALYTICS MIGRATION
-- Adds support for tracking total website visits, unique visitors, and trends
-- ============================================================================

create table if not exists public.website_visits (
    id uuid primary key default gen_random_uuid(),
    visitor_id text not null,
    session_id text not null,
    page_path text not null,
    user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

-- Index for quick analytics queries
create index if not exists idx_website_visits_created_at on public.website_visits(created_at);
create index if not exists idx_website_visits_visitor_session on public.website_visits(visitor_id, session_id);
create index if not exists idx_website_visits_page_path on public.website_visits(page_path);

alter table public.website_visits enable row level security;

-- Public can insert visits
create policy "Allow public insert on website_visits" on public.website_visits for insert with check (true);

-- Admin can read all
create policy "Admin read website_visits" on public.website_visits for select using (public.is_admin());

-- Add visitor_id to product_views
alter table public.product_views add column if not exists visitor_id text;
create index if not exists idx_product_views_visitor on public.product_views(visitor_id);

-- Also allow fetching product metrics for admin dashboard if not already allowed
-- (already covered by public read policy on product_metrics)

-- RPC to get dashboard analytics
create or replace function public.get_dashboard_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_total_visits int;
    v_unique_visitors int;
    v_returning_visitors int;
    v_product_views int;
    v_most_viewed jsonb;
    v_daily_visits jsonb;
    v_recent_activity jsonb;
begin
    -- Check admin
    if not public.is_admin() then
        return '{"error": "Unauthorized"}'::jsonb;
    end if;

    select count(*) into v_total_visits from public.website_visits;
    select count(distinct visitor_id) into v_unique_visitors from public.website_visits;
    
    with visitor_counts as (
        select visitor_id, count(distinct session_id) as session_count
        from public.website_visits
        group by visitor_id
    )
    select count(*) into v_returning_visitors from visitor_counts where session_count > 1;

    select coalesce(sum(view_count), 0) into v_product_views from public.product_metrics;

    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_most_viewed
    from (
        select p.id, p.name, p.category, m.view_count, p.images
        from public.products p
        join public.product_metrics m on p.id = m.product_id
        order by m.view_count desc
        limit 5
    ) t;

    select coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb) into v_daily_visits
    from (
        select date_trunc('day', created_at) as date, count(*) as visits
        from public.website_visits
        where created_at >= now() - interval '30 days'
        group by date_trunc('day', created_at)
        order by date asc
    ) d;

    select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) into v_recent_activity
    from (
        select page_path, created_at, visitor_id, session_id
        from public.website_visits
        order by created_at desc
        limit 10
    ) r;

    return jsonb_build_object(
        'total_visits', coalesce(v_total_visits, 0),
        'unique_visitors', coalesce(v_unique_visitors, 0),
        'returning_visitors', coalesce(v_returning_visitors, 0),
        'product_views', coalesce(v_product_views, 0),
        'most_viewed_products', coalesce(v_most_viewed, '[]'::jsonb),
        'daily_visits', coalesce(v_daily_visits, '[]'::jsonb),
        'recent_activity', coalesce(v_recent_activity, '[]'::jsonb)
    );
end;
$$;


