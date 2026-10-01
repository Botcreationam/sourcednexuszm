-- ============================================================================
-- SOURCED NEXUS — CUSTOMER MESSAGING MIGRATION
-- Adds a messaging system bound to customer inquiries
-- ============================================================================

create table if not exists public.customer_inquiry_messages (
    id uuid primary key default gen_random_uuid(),
    inquiry_id uuid references public.customer_inquiries(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    is_admin boolean not null default false,
    content text not null,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_inquiry_messages_inquiry_id on public.customer_inquiry_messages(inquiry_id);
create index if not exists idx_inquiry_messages_created_at on public.customer_inquiry_messages(created_at asc);

alter table public.customer_inquiry_messages enable row level security;

-- Admins can read all messages
create policy "Admins can view all messages" on public.customer_inquiry_messages for select
using (public.is_admin());

-- Users can read messages for their own inquiries
create policy "Users can view messages for own inquiries" on public.customer_inquiry_messages for select
using (
    exists (
        select 1 from public.customer_inquiries ci 
        where ci.id = inquiry_id 
        and ci.user_id = auth.uid()
    )
);

-- Anyone can insert messages (if they own the inquiry or are admin)
create policy "Users can insert messages" on public.customer_inquiry_messages for insert
with check (
    public.is_admin() or 
    exists (
        select 1 from public.customer_inquiries ci 
        where ci.id = inquiry_id 
        and ci.user_id = auth.uid()
    )
);

-- Trigger to update the parent inquiry updated_at when a new message is sent
create or replace function public.handle_new_inquiry_message()
returns trigger as $$
begin
    update public.customer_inquiries 
    set updated_at = now(),
        status = case 
            when new.is_admin then 'Reviewing' -- or whatever status denotes admin replied
            else 'Pending'
        end
    where id = new.inquiry_id;
    return new;
end;
$$ language plpgsql;

drop trigger if exists on_new_inquiry_message on public.customer_inquiry_messages;
create trigger on_new_inquiry_message
    after insert on public.customer_inquiry_messages
    for each row
    execute function public.handle_new_inquiry_message();

-- Ensure Supabase Realtime is enabled for this table and for comments
alter publication supabase_realtime add table public.customer_inquiry_messages;
alter publication supabase_realtime add table public.product_comments;
