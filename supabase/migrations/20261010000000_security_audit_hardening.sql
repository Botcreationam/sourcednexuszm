-- ============================================================================
-- SOURCED NEXUS - SECURITY AUDIT HARDENING (2026-10-10)
-- Additive and idempotent. Does not delete or rewrite any customer data.
-- Review, then apply via the normal migration pipeline. NOT auto-applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. product_views: stop exposing visitor/user/session identifiers publicly.
--    The app only INSERTs into this table (src/lib/recommendations.js); the
--    admin dashboard reads aggregates through the get_dashboard_analytics()
--    security-definer RPC, so a public SELECT is not needed.
-- ----------------------------------------------------------------------------
drop policy if exists "Allow public read on product_views" on public.product_views;
drop policy if exists "Admin read product_views" on public.product_views;
create policy "Admin read product_views"
    on public.product_views for select
    to authenticated
    using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. Anonymous / public INSERT policies: bind user_id to the caller so a
--    client can never attribute rows to somebody else's account.
-- ----------------------------------------------------------------------------
drop policy if exists "Allow public insert on product_views" on public.product_views;
create policy "Allow public insert on product_views"
    on public.product_views for insert
    with check (user_id is null or user_id = auth.uid());

drop policy if exists "Allow public insert on website_visits" on public.website_visits;
create policy "Allow public insert on website_visits"
    on public.website_visits for insert
    with check (
        (user_id is null or user_id = auth.uid())
        and char_length(visitor_id) <= 100
        and char_length(session_id) <= 100
        and char_length(page_path) <= 500
    );

-- ----------------------------------------------------------------------------
-- 3. customer_inquiries: anyone may still submit (anonymous quote requests are
--    a feature), but direct PostgREST inserts can no longer claim another
--    user's id, set an admin-only status, or store oversized payloads.
-- ----------------------------------------------------------------------------
drop policy if exists "Anyone can submit inquiry" on public.customer_inquiries;
create policy "Anyone can submit inquiry"
    on public.customer_inquiries for insert
    with check (
        (user_id is null or user_id = auth.uid())
        and status = 'Pending'
        and char_length(customer_name) <= 100
        and char_length(contact_number) <= 35
        and coalesce(char_length(specifications), 0) <= 1000
        and coalesce(char_length(additional_instructions), 0) <= 2000
        and coalesce(jsonb_array_length(items), 0) <= 50
    );

-- ----------------------------------------------------------------------------
-- 4. is_admin(): pin search_path on this SECURITY DEFINER function so it
--    cannot be hijacked by objects in a caller-controlled schema.
--    Behaviour is unchanged (same admin_users + email allowlist logic).
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and role in ('admin', 'superadmin')
  )
  or exists (
    select 1 from auth.users
    where id = auth.uid()
    and email in ('sourcednexus@gmail.com', 'admin@sourcednexus.com', 'frankmwalu04@gmail.com')
  );
$$;

-- ----------------------------------------------------------------------------
-- 5. Preorder photos: bucket must be private (policies already restrict reads
--    to owner/admin; this makes sure the bucket itself is not public).
-- ----------------------------------------------------------------------------
update storage.buckets set public = false where id = 'preorder-uploads';
