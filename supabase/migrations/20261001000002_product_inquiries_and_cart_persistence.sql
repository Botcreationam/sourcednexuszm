-- ============================================================================
-- SOURCED NEXUS — COMPLETE SELF-CONTAINED MIGRATION
-- Creates user_profiles, customer_inquiries, cart/wishlist persistence, and RLS
-- ============================================================================

-- 0. ENSURE ADMIN HELPER FUNCTION EXISTS
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
    and (
      email in ('sourcednexus@gmail.com', 'admin@sourcednexus.com')
      or coalesce(raw_user_meta_data->>'role', '') = 'admin'
      or coalesce(raw_app_meta_data->>'role', '') = 'admin'
    )
  );
$$;

-- 1. CREATE USER PROFILES TABLE (If not already created)
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
    cart jsonb not null default '[]'::jsonb,
    wishlist jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Ensure cart and wishlist columns exist if user_profiles was previously created
alter table public.user_profiles
    add column if not exists cart jsonb not null default '[]'::jsonb,
    add column if not exists wishlist jsonb not null default '[]'::jsonb;

-- Indexes for user profiles
create index if not exists idx_user_profiles_interests on public.user_profiles using gin (interests);

-- Automatic user_profile sync on auth signup
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

-- RLS for user profiles
alter table public.user_profiles enable row level security;

drop policy if exists "Users can view own profile or admin" on public.user_profiles;
create policy "Users can view own profile or admin"
    on public.user_profiles for select
    to authenticated
    using (auth.uid() = id or public.is_admin());

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
    on public.user_profiles for insert
    to authenticated
    with check (auth.uid() = id or public.is_admin());

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
    on public.user_profiles for update
    to authenticated
    using (auth.uid() = id or public.is_admin())
    with check (auth.uid() = id or public.is_admin());

drop policy if exists "Users can delete own profile" on public.user_profiles;
create policy "Users can delete own profile"
    on public.user_profiles for delete
    to authenticated
    using (auth.uid() = id or public.is_admin());

-- 2. CREATE CUSTOMER INQUIRIES TABLE
create table if not exists public.customer_inquiries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    inquiry_type text not null default 'quote_request' check (inquiry_type in ('quote_request', 'preorder', 'product_inquiry')),
    customer_name text not null,
    contact_number text not null,
    email text,
    items jsonb not null default '[]'::jsonb,
    total_items integer not null default 1,
    specifications text,
    additional_instructions text,
    status text not null default 'Pending' check (status in ('Pending', 'Reviewing', 'Quoted', 'Confirmed', 'Completed', 'Cancelled')),
    source text not null default 'website' check (source in ('website', 'whatsapp')),
    ip_address text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Performance indexes for inquiry management
create index if not exists idx_customer_inquiries_status on public.customer_inquiries(status);
create index if not exists idx_customer_inquiries_user_id on public.customer_inquiries(user_id);
create index if not exists idx_customer_inquiries_created_at on public.customer_inquiries(created_at desc);
create index if not exists idx_customer_inquiries_contact on public.customer_inquiries(contact_number);

-- Automatic updated_at trigger for inquiries
drop trigger if exists set_customer_inquiries_updated_at on public.customer_inquiries;
create trigger set_customer_inquiries_updated_at
    before update on public.customer_inquiries
    for each row
    execute function public.handle_updated_at();

-- 3. ROW LEVEL SECURITY (RLS) POLICIES FOR INQUIRIES
alter table public.customer_inquiries enable row level security;

drop policy if exists "Anyone can submit inquiry" on public.customer_inquiries;
create policy "Anyone can submit inquiry"
    on public.customer_inquiries for insert
    with check (true);

drop policy if exists "Customers can view their own inquiries or admin" on public.customer_inquiries;
create policy "Customers can view their own inquiries or admin"
    on public.customer_inquiries for select
    using (
        (auth.uid() is not null and auth.uid() = user_id)
        or public.is_admin()
    );

drop policy if exists "Admins can update inquiries" on public.customer_inquiries;
create policy "Admins can update inquiries"
    on public.customer_inquiries for update
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "Admins can delete inquiries" on public.customer_inquiries;
create policy "Admins can delete inquiries"
    on public.customer_inquiries for delete
    using (public.is_admin());
