-- Fix the `is_admin()` function to include the correct admin accounts
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
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
