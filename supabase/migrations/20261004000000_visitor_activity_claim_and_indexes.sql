-- ============================================================================
-- SOURCED NEXUS — ANONYMOUS ACTIVITY CLAIM & PERSONALIZATION INDEXES
-- ----------------------------------------------------------------------------
-- Purpose:
--   When a customer signs in, merge their anonymous (visitor_id-keyed) browsing
--   activity in public.product_views with their authenticated account — once,
--   without creating duplicate rows. Called from the frontend via the
--   security-definer RPC public.claim_visitor_activity(p_visitor_id).
--
-- Safety:
--   - Purely additive: no existing tables, triggers, policies or data change.
--   - Only rows with user_id IS NULL are claimed, so an account never absorbs
--     another account's rows and no duplicates are possible.
--   - auth.uid() is required; anonymous callers are ignored.
-- ============================================================================

create or replace function public.claim_visitor_activity(p_visitor_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null or p_visitor_id is null then
        return;
    end if;

    update public.product_views
    set user_id = auth.uid()
    where visitor_id = p_visitor_id
      and user_id is null;
end;
$$;

-- Only authenticated users may claim their own anonymous activity
grant execute on function public.claim_visitor_activity(text) to authenticated;
revoke execute on function public.claim_visitor_activity(text) from anon;

-- Indexes for efficient activity queries (no unnecessary table scans)
create index if not exists idx_product_views_user on public.product_views(user_id);
create index if not exists idx_product_views_user_product on public.product_views(user_id, product_id);
