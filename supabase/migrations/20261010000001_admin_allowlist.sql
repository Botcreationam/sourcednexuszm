-- ============================================================================
-- Admin email allowlist (2026-10-10): exactly three administrator accounts.
-- Removes 'admin@sourcednexus.com'; adds 'joshuankuba04@gmail.com'.
-- Idempotent. Does not delete any users or customer data.
-- ============================================================================
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
    and lower(email) in ('sourcednexus@gmail.com', 'joshuankuba04@gmail.com', 'frankmwalu04@gmail.com')
  );
$$;
