-- ============================================================================
-- FIX: Update is_admin() to include all authorized admin emails
-- Ensures RLS delete/update policies work for all admins
-- ============================================================================

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
      email in (
        'sourcednexus@gmail.com',
        'admin@sourcednexus.com',
        'frankmwalu04@gmail.com'
      )
      or coalesce(raw_user_meta_data->>'role', '') = 'admin'
      or coalesce(raw_app_meta_data->>'role', '') = 'admin'
    )
  );
$$;
