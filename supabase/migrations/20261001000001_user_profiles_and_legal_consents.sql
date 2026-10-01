-- ============================================================================
-- SOURCED NEXUS — USER PROFILES, INTERESTS & LEGAL CONSENT SCHEMA MIGRATION
-- Compliant with the Zambian Data Protection Act No. 3 of 2021
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USER PROFILES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    interests text[] not null default '{}',
    terms_accepted boolean not null default false,
    terms_version text default '2026-v1.0',
    terms_accepted_at timestamptz,
    privacy_accepted boolean not null default false,
    privacy_version text default '2026-v1.0',
    privacy_accepted_at timestamptz,
    marketing_consent boolean not null default false,
    personalization_consent boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Index for high speed lookups
create index if not exists idx_user_profiles_interests on public.user_profiles using gin (interests);

-- ----------------------------------------------------------------------------
-- 2. AUTOMATIC PROFILE CREATION TRIGGER ON AUTH SIGNUP
-- ----------------------------------------------------------------------------
create or replace function public.handle_user_profile_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    meta jsonb;
    user_interests text[];
begin
    meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

    -- Extract string array of interests if present in metadata
    if jsonb_typeof(meta->'interests') = 'array' then
        select array_agg(elem::text)
        into user_interests
        from jsonb_array_elements_text(meta->'interests') as elem;
    else
        user_interests := '{}';
    end if;

    insert into public.user_profiles (
        id,
        interests,
        terms_accepted,
        terms_version,
        terms_accepted_at,
        privacy_accepted,
        privacy_version,
        privacy_accepted_at,
        marketing_consent,
        personalization_consent,
        created_at,
        updated_at
    )
    values (
        new.id,
        coalesce(user_interests, '{}'),
        coalesce((meta->>'terms_accepted')::boolean, false),
        coalesce(meta->>'terms_version', '2026-v1.0'),
        case when meta ? 'terms_accepted_at' then (meta->>'terms_accepted_at')::timestamptz else null end,
        coalesce((meta->>'privacy_accepted')::boolean, false),
        coalesce(meta->>'privacy_version', '2026-v1.0'),
        case when meta ? 'privacy_accepted_at' then (meta->>'privacy_accepted_at')::timestamptz else null end,
        coalesce((meta->>'marketing_consent')::boolean, false),
        coalesce((meta->>'personalization_consent')::boolean, true),
        now(),
        now()
    )
    on conflict (id) do update set
        interests = case 
            when array_length(excluded.interests, 1) > 0 then excluded.interests 
            else public.user_profiles.interests 
        end,
        terms_accepted = excluded.terms_accepted,
        privacy_accepted = excluded.privacy_accepted,
        marketing_consent = excluded.marketing_consent,
        personalization_consent = excluded.personalization_consent,
        updated_at = now();

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
    after insert or update of raw_user_meta_data on auth.users
    for each row
    execute function public.handle_user_profile_sync();

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES FOR USER PROFILES
-- ----------------------------------------------------------------------------
alter table public.user_profiles enable row level security;

-- Users can read their own profile; admins can read all
create policy "Users can view own profile or admin"
    on public.user_profiles for select
    to authenticated
    using (auth.uid() = id or public.is_admin());

-- Users can insert their own profile
create policy "Users can insert own profile"
    on public.user_profiles for insert
    to authenticated
    with check (auth.uid() = id or public.is_admin());

-- Users can update their own profile
create policy "Users can update own profile"
    on public.user_profiles for update
    to authenticated
    using (auth.uid() = id or public.is_admin())
    with check (auth.uid() = id or public.is_admin());

-- Users can delete their own profile
create policy "Users can delete own profile"
    on public.user_profiles for delete
    to authenticated
    using (auth.uid() = id or public.is_admin());
