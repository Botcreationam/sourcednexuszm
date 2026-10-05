-- ============================================================================
-- SOURCED NEXUS - PRODUCT UPDATE EMAIL NOTIFICATIONS
-- ----------------------------------------------------------------------------
-- Flow:  admin saves product (DB confirms)  ->  trigger on public.products
--        creates ONE idempotent event  ->  server worker queues per-user
--        deliveries  ->  worker sends email  ->  status recorded.
--
-- Safe to run more than once. Does not touch existing data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USER PREFERENCE  (stored on the existing public.user_profiles row)
-- ----------------------------------------------------------------------------
alter table public.user_profiles
    add column if not exists product_notifications_enabled boolean not null default true;

-- Existing RLS on user_profiles already restricts each user to their own row
-- (select/insert/update "own profile" policies), so a user can only change
-- their own preference and never another user's.

-- ----------------------------------------------------------------------------
-- 2. ADMIN "NOTIFY USERS" OPT-IN  (a deliberate trigger, off by default)
-- ----------------------------------------------------------------------------
-- The admin form sets this for ONE save. The trigger reads it, then always
-- resets it to false so it can never leak into a later unrelated edit.
alter table public.products
    add column if not exists notify_users boolean not null default false;

-- ----------------------------------------------------------------------------
-- 3. EVENTS  (one row per meaningful product change; idempotent)
-- ----------------------------------------------------------------------------
create table if not exists public.product_notification_events (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    event_type text not null check (event_type in ('new_product', 'product_updated')),
    -- Human readable summary shown in the "Updated information" email block.
    change_summary text,
    changed_fields text[] not null default '{}',
    -- Deterministic key: same product + same type + same content fingerprint
    -- => same key => the UNIQUE constraint rejects the duplicate.
    dedupe_key text not null unique,
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'completed', 'failed', 'skipped')),
    recipients_queued integer not null default 0,
    created_at timestamptz not null default now(),
    processed_at timestamptz
);

create index if not exists idx_pne_status on public.product_notification_events(status, created_at);
create index if not exists idx_pne_product on public.product_notification_events(product_id);

-- ----------------------------------------------------------------------------
-- 4. DELIVERIES  (one row per user per event: the actual email queue)
-- ----------------------------------------------------------------------------
create table if not exists public.product_notification_deliveries (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.product_notification_events(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    product_id uuid not null references public.products(id) on delete cascade,
    notification_type text not null,
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'sent', 'failed')),
    attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    claimed_at timestamptz,
    provider_message_id text,
    failure_reason text,
    permanent_failure boolean not null default false,
    created_at timestamptz not null default now(),
    sent_at timestamptz,
    -- A user can never get two emails for the same event, even if the queueing
    -- step runs twice or races.
    unique (event_id, user_id)
);

create index if not exists idx_pnd_queue
    on public.product_notification_deliveries(status, next_attempt_at);
create index if not exists idx_pnd_event on public.product_notification_deliveries(event_id);
create index if not exists idx_pnd_user on public.product_notification_deliveries(user_id);

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
--    Only the server (service role, which bypasses RLS) writes these tables.
--    Admins may read EVENTS and aggregate counts; nobody reads delivery rows
--    from the browser, so customer identities are never exposed.
-- ----------------------------------------------------------------------------
alter table public.product_notification_events enable row level security;
alter table public.product_notification_deliveries enable row level security;

drop policy if exists "Admins can read notification events" on public.product_notification_events;
create policy "Admins can read notification events"
    on public.product_notification_events for select
    to authenticated
    using (public.is_admin());

-- No insert/update/delete policies on either table => browsers cannot forge
-- or alter events or deliveries. No select policy on deliveries at all.

-- ----------------------------------------------------------------------------
-- 6. AGGREGATE-ONLY HELPERS FOR THE ADMIN PANEL  (no email addresses leak)
-- ----------------------------------------------------------------------------
create or replace function public.count_eligible_notification_recipients()
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'not authorized';
    end if;
    return (
        select count(*)::integer
        from auth.users u
        left join public.user_profiles p on p.id = u.id
        where u.email is not null
          and u.email <> ''
          and u.deleted_at is null
          and u.banned_until is null
          and coalesce(p.product_notifications_enabled, true) = true
    );
end;
$$;

create or replace function public.get_product_notification_status(p_product_id uuid)
returns table (
    event_id uuid,
    event_type text,
    event_status text,
    queued integer,
    pending integer,
    sent integer,
    failed integer,
    created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'not authorized';
    end if;
    return query
    select e.id,
           e.event_type,
           e.status,
           count(d.id)::integer,
           count(d.id) filter (where d.status in ('pending', 'processing'))::integer,
           count(d.id) filter (where d.status = 'sent')::integer,
           count(d.id) filter (where d.status = 'failed')::integer,
           e.created_at
    from public.product_notification_events e
    left join public.product_notification_deliveries d on d.event_id = e.id
    where e.product_id = p_product_id
    group by e.id
    order by e.created_at desc
    limit 1;
end;
$$;

revoke all on function public.count_eligible_notification_recipients() from public, anon;
revoke all on function public.get_product_notification_status(uuid) from public, anon;
grant execute on function public.count_eligible_notification_recipients() to authenticated;
grant execute on function public.get_product_notification_status(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. THE TRIGGER  (fires only AFTER the database has accepted the write)
-- ----------------------------------------------------------------------------
-- Rules:
--   * Only when the admin ticked "notify users" (notify_users = true).
--   * Only for products customers can actually see (status <> 'hidden').
--   * INSERT  -> 'new_product'.
--   * UPDATE  -> 'product_updated' ONLY if a customer-facing field changed,
--                or the product just became visible (hidden -> visible), which
--                is treated as "published".
--   * Internal columns (updated_at, is_popular, is_new_arrival, delivery_info,
--     notify_users itself, created_at...) never count as meaningful.
--   * The dedupe key is a hash of the customer-facing content, so saving the
--     identical state twice produces the same key and is rejected by UNIQUE.
-- BEFORE trigger: makes notify_users one-shot by clearing the stored value.
create or replace function public.reset_product_notify_flag()
returns trigger
language plpgsql
as $$
begin
    -- Stash the admin's intent in a transaction-local setting for the AFTER
    -- trigger, then clear the persisted column so it is never sticky.
    perform set_config('app.notify_users', coalesce(new.notify_users, false)::text, true);
    new.notify_users := false;
    return new;
end;
$$;

-- AFTER function: reads the transaction-local intent (the column itself is already
-- cleared by the BEFORE trigger, so it can never be sticky).
create or replace function public.enqueue_product_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_type text;
    v_changed text[] := '{}';
    v_summary text;
    v_fingerprint text;
    v_key text;
begin
    if coalesce(current_setting('app.notify_users', true), 'false') <> 'true' then
        return new;
    end if;
    -- consume the intent so a second statement in the same transaction cannot reuse it
    perform set_config('app.notify_users', 'false', true);

    if new.status = 'hidden' then
        return new;
    end if;

    if tg_op = 'INSERT' then
        v_type := 'new_product';
        v_changed := array['new'];
        v_summary := 'New product available';
    else
        if new.name is distinct from old.name then v_changed := array_append(v_changed, 'name'); end if;
        if new.price is distinct from old.price then v_changed := array_append(v_changed, 'price'); end if;
        if new.description is distinct from old.description then v_changed := array_append(v_changed, 'description'); end if;
        if new.category is distinct from old.category then v_changed := array_append(v_changed, 'category'); end if;
        if new.images is distinct from old.images then v_changed := array_append(v_changed, 'images'); end if;
        if new.sizes is distinct from old.sizes then v_changed := array_append(v_changed, 'sizes'); end if;
        if new.colors is distinct from old.colors then v_changed := array_append(v_changed, 'colors'); end if;
        if new.status is distinct from old.status then v_changed := array_append(v_changed, 'availability'); end if;
        if new.grades is distinct from old.grades then v_changed := array_append(v_changed, 'grades'); end if;

        if old.status = 'hidden' then
            v_type := 'new_product';
            v_changed := array['published'];
            v_summary := 'New product available';
        elsif array_length(v_changed, 1) is null then
            return new;
        else
            v_type := 'product_updated';
            v_summary := 'Updated: ' || array_to_string(
                array(select case c
                    when 'name' then 'product name'
                    when 'price' then 'price'
                    when 'description' then 'description'
                    when 'category' then 'category'
                    when 'images' then 'product images'
                    when 'sizes' then 'available sizes'
                    when 'colors' then 'available colors'
                    when 'availability' then 'availability (now ' || new.status || ')'
                    when 'grades' then 'grade pricing and stock'
                    else c end
                    from unnest(v_changed) as c),
                ', ');
        end if;
    end if;

    v_fingerprint := md5(concat_ws('|',
        coalesce(new.name, ''), coalesce(new.price, ''), coalesce(new.description, ''),
        coalesce(new.category, ''), coalesce(array_to_string(new.images, ','), ''),
        coalesce(new.status, ''), coalesce(new.grades::text, '')
    ));
    v_key := new.id::text || ':' || v_type || ':' || v_fingerprint;

    insert into public.product_notification_events
        (product_id, event_type, change_summary, changed_fields, dedupe_key)
    values
        (new.id, v_type, v_summary, v_changed, v_key)
    on conflict (dedupe_key) do nothing;

    return new;
end;
$$;

drop trigger if exists trg_products_reset_notify on public.products;
create trigger trg_products_reset_notify
    before insert or update on public.products
    for each row execute function public.reset_product_notify_flag();

drop trigger if exists trg_products_enqueue_notification on public.products;
create trigger trg_products_enqueue_notification
    after insert or update on public.products
    for each row execute function public.enqueue_product_notification_event();

-- ----------------------------------------------------------------------------
-- 8. SERVER-SIDE QUEUE FUNCTIONS  (called only by the service-role worker)
-- ----------------------------------------------------------------------------

-- Turn a pending event into one delivery row per eligible user. Idempotent:
-- unique(event_id, user_id) + ON CONFLICT DO NOTHING means running it twice,
-- or two workers racing, cannot create duplicate deliveries.
create or replace function public.queue_product_notification_event(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_event public.product_notification_events%rowtype;
    v_count integer;
begin
    -- Claim the event atomically: only one worker can move pending -> processing.
    update public.product_notification_events
       set status = 'processing'
     where id = p_event_id and status = 'pending'
    returning * into v_event;

    if not found then
        return 0;  -- already claimed / processed by someone else
    end if;

    insert into public.product_notification_deliveries
        (event_id, user_id, product_id, notification_type)
    select v_event.id, u.id, v_event.product_id, v_event.event_type
    from auth.users u
    left join public.user_profiles p on p.id = u.id
    where u.email is not null
      and u.email <> ''
      and u.deleted_at is null
      and u.banned_until is null
      and coalesce(p.product_notifications_enabled, true) = true
    on conflict (event_id, user_id) do nothing;

    get diagnostics v_count = row_count;

    update public.product_notification_events
       set recipients_queued = v_count,
           status = case when v_count = 0 then 'skipped' else 'processing' end,
           processed_at = case when v_count = 0 then now() else null end
     where id = v_event.id;

    return v_count;
end;
$$;

-- Atomically claim a batch of due deliveries (safe with concurrent workers).
create or replace function public.claim_product_notification_deliveries(p_limit integer default 50)
returns setof public.product_notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    update public.product_notification_deliveries d
       set status = 'processing', attempts = d.attempts + 1, claimed_at = now()
     where d.id in (
        select x.id from public.product_notification_deliveries x
         where x.permanent_failure = false
           and x.next_attempt_at <= now()
           and (
                x.status = 'pending'
                -- abandoned claim (worker crashed / timed out): take it back after 10 min
                or (x.status = 'processing' and x.claimed_at <= now() - interval '10 minutes')
           )
         order by x.next_attempt_at
         limit greatest(1, least(p_limit, 200))
         for update skip locked
     )
    returning d.*;
end;
$$;

-- Close out events whose deliveries are all finished.
create or replace function public.finalize_product_notification_events()
returns void
language sql
security definer
set search_path = public
as $$
    update public.product_notification_events e
       set status = case
               when exists (select 1 from public.product_notification_deliveries d
                            where d.event_id = e.id and d.status = 'failed') then 'failed'
               else 'completed' end,
           processed_at = now()
     where e.status = 'processing'
       and not exists (select 1 from public.product_notification_deliveries d
                       where d.event_id = e.id and d.status in ('pending', 'processing'));
$$;

-- Server-only. Never callable from a browser.
revoke all on function public.queue_product_notification_event(uuid) from public, anon, authenticated;
revoke all on function public.claim_product_notification_deliveries(integer) from public, anon, authenticated;
revoke all on function public.finalize_product_notification_events() from public, anon, authenticated;
grant execute on function public.queue_product_notification_event(uuid) to service_role;
grant execute on function public.claim_product_notification_deliveries(integer) to service_role;
grant execute on function public.finalize_product_notification_events() to service_role;
