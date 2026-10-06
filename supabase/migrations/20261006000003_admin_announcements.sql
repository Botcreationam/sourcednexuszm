-- ============================================================================
-- SOURCED NEXUS - ADMIN ANNOUNCEMENTS (custom messages emailed to customers)
-- ----------------------------------------------------------------------------
-- Flow: admin writes a message -> row in admin_announcements (status pending)
--       -> server worker queues one delivery per eligible user
--       -> worker sends email -> status recorded per user.
--
-- Reuses the same opt-out switch as product emails
-- (user_profiles.product_notifications_enabled): anyone who turned emails off
-- is never mailed. Safe to run more than once.
-- ============================================================================

-- 1. ANNOUNCEMENTS (one row per message the admin sends)
create table if not exists public.admin_announcements (
    id uuid primary key default gen_random_uuid(),
    subject text not null check (char_length(subject) between 1 and 150),
    message text not null check (char_length(message) between 1 and 5000),
    button_label text check (button_label is null or char_length(button_label) <= 40),
    button_url text check (button_url is null or button_url ~ '^https://'),
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'completed', 'failed', 'skipped')),
    recipients_queued integer not null default 0,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    processed_at timestamptz
);

create index if not exists idx_announcements_status
    on public.admin_announcements(status, created_at);

-- 2. DELIVERIES (one row per user per announcement)
create table if not exists public.announcement_deliveries (
    id uuid primary key default gen_random_uuid(),
    announcement_id uuid not null references public.admin_announcements(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
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
    -- A user can never receive the same announcement twice.
    unique (announcement_id, user_id)
);

create index if not exists idx_ad_queue
    on public.announcement_deliveries(status, next_attempt_at);
create index if not exists idx_ad_announcement
    on public.announcement_deliveries(announcement_id);

-- 3. ROW LEVEL SECURITY
alter table public.admin_announcements enable row level security;
alter table public.announcement_deliveries enable row level security;

-- Admins can read announcements (history). Nobody can write from a browser:
-- creating one goes through create_announcement() below, which checks is_admin().
drop policy if exists "Admins can read announcements" on public.admin_announcements;
create policy "Admins can read announcements"
    on public.admin_announcements for select
    to authenticated
    using (public.is_admin());
-- No policies on announcement_deliveries: customer identities are never exposed.

-- 4. ADMIN-CALLABLE FUNCTIONS (checked with is_admin())
create or replace function public.create_announcement(
    p_subject text,
    p_message text,
    p_button_label text default null,
    p_button_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    if not public.is_admin() then
        raise exception 'not authorized';
    end if;
    insert into public.admin_announcements (subject, message, button_label, button_url, created_by)
    values (
        btrim(p_subject),
        btrim(p_message),
        nullif(btrim(coalesce(p_button_label, '')), ''),
        nullif(btrim(coalesce(p_button_url, '')), ''),
        auth.uid()
    )
    returning id into v_id;
    return v_id;
end;
$$;

create or replace function public.list_announcements()
returns table (
    id uuid,
    subject text,
    message text,
    status text,
    recipients_queued integer,
    sent integer,
    failed integer,
    pending integer,
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
    select a.id,
           a.subject,
           a.message,
           a.status,
           a.recipients_queued,
           count(d.id) filter (where d.status = 'sent')::integer,
           count(d.id) filter (where d.status = 'failed')::integer,
           count(d.id) filter (where d.status in ('pending', 'processing'))::integer,
           a.created_at
    from public.admin_announcements a
    left join public.announcement_deliveries d on d.announcement_id = a.id
    group by a.id
    order by a.created_at desc
    limit 20;
end;
$$;

revoke all on function public.create_announcement(text, text, text, text) from public, anon;
revoke all on function public.list_announcements() from public, anon;
grant execute on function public.create_announcement(text, text, text, text) to authenticated;
grant execute on function public.list_announcements() to authenticated;

-- 5. SERVER-ONLY QUEUE FUNCTIONS (service-role worker)
create or replace function public.queue_announcement(p_announcement_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row public.admin_announcements%rowtype;
    v_count integer;
begin
    -- Atomic claim: only one worker can move pending -> processing.
    update public.admin_announcements
       set status = 'processing'
     where id = p_announcement_id and status = 'pending'
    returning * into v_row;

    if not found then
        return 0;
    end if;

    insert into public.announcement_deliveries (announcement_id, user_id)
    select v_row.id, u.id
    from auth.users u
    left join public.user_profiles p on p.id = u.id
    where u.email is not null
      and u.email <> ''
      and u.deleted_at is null
      and u.banned_until is null
      and coalesce(p.product_notifications_enabled, true) = true
    on conflict (announcement_id, user_id) do nothing;

    get diagnostics v_count = row_count;

    update public.admin_announcements
       set recipients_queued = v_count,
           status = case when v_count = 0 then 'skipped' else 'processing' end,
           processed_at = case when v_count = 0 then now() else null end
     where id = v_row.id;

    return v_count;
end;
$$;

create or replace function public.claim_announcement_deliveries(p_limit integer default 50)
returns setof public.announcement_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    update public.announcement_deliveries d
       set status = 'processing', attempts = d.attempts + 1, claimed_at = now()
     where d.id in (
        select x.id from public.announcement_deliveries x
         where x.permanent_failure = false
           and x.next_attempt_at <= now()
           and (
                x.status = 'pending'
                or (x.status = 'processing' and x.claimed_at <= now() - interval '10 minutes')
           )
         order by x.next_attempt_at
         limit greatest(1, least(p_limit, 200))
         for update skip locked
     )
    returning d.*;
end;
$$;

create or replace function public.finalize_announcements()
returns void
language sql
security definer
set search_path = public
as $$
    update public.admin_announcements a
       set status = case
               when exists (select 1 from public.announcement_deliveries d
                            where d.announcement_id = a.id and d.status = 'failed') then 'failed'
               else 'completed' end,
           processed_at = now()
     where a.status = 'processing'
       and not exists (select 1 from public.announcement_deliveries d
                       where d.announcement_id = a.id and d.status in ('pending', 'processing'));
$$;

revoke all on function public.queue_announcement(uuid) from public, anon, authenticated;
revoke all on function public.claim_announcement_deliveries(integer) from public, anon, authenticated;
revoke all on function public.finalize_announcements() from public, anon, authenticated;
grant execute on function public.queue_announcement(uuid) to service_role;
grant execute on function public.claim_announcement_deliveries(integer) to service_role;
grant execute on function public.finalize_announcements() to service_role;
