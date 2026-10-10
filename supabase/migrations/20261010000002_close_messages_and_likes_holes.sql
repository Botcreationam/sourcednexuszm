-- ============================================================================
-- Close two remaining holes found in the 2026-10 security audit.
-- Additive and idempotent. Does not delete or rewrite any customer data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. mark_messages_read(): was SECURITY DEFINER, callable by anonymous users,
--    and trusted the client-supplied p_is_admin flag. Anyone could mark any
--    inquiry's messages read, or claim to be admin. Now the caller must be
--    signed in, and either the owner of the inquiry or a real admin. The
--    p_is_admin argument is kept so existing callers do not break, but it is
--    only honoured when the caller really is an admin.
-- ----------------------------------------------------------------------------
create or replace function public.mark_messages_read(p_inquiry_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := false;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_admin := public.is_admin();

  select user_id into v_owner from public.customer_inquiries where id = p_inquiry_id;
  if not found then
    return;  -- unknown inquiry: nothing to do, reveal nothing
  end if;

  if p_is_admin and v_admin then
    update public.customer_inquiry_messages
       set read_at = now()
     where inquiry_id = p_inquiry_id and not is_admin and read_at is null;
    update public.customer_inquiries set has_unread_admin = false where id = p_inquiry_id;
  elsif v_owner is not null and v_owner = v_uid then
    update public.customer_inquiry_messages
       set read_at = now()
     where inquiry_id = p_inquiry_id and is_admin and read_at is null;
    update public.customer_inquiries set has_unread_customer = false where id = p_inquiry_id;
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$function$;

revoke all on function public.mark_messages_read(uuid, boolean) from public, anon;
grant execute on function public.mark_messages_read(uuid, boolean) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. product_likes: public SELECT exposed which account liked which product.
--    The app only INSERTs/DELETEs; public like counts come from the
--    product_metrics table via trigger. Owners and admins may still read.
-- ----------------------------------------------------------------------------
drop policy if exists "Allow public read on product_likes" on public.product_likes;
drop policy if exists "Users read own likes or admin" on public.product_likes;
create policy "Users read own likes or admin"
    on public.product_likes for select
    to authenticated
    using (user_id = auth.uid() or public.is_admin());
