-- ============================================================================
-- SOURCED NEXUS — PRODUCT GRADES MIGRATION
-- Adds support for product grades (First Grade, Second Grade, etc)
-- ============================================================================

alter table public.products add column if not exists grades jsonb not null default '[]'::jsonb;

alter table public.customer_inquiries drop constraint if exists customer_inquiries_status_check;
alter table public.customer_inquiries add constraint customer_inquiries_status_check check (status in ('New', 'Contacted', 'Pending', 'Reviewing', 'Quoted', 'Confirmed', 'Completed', 'Cancelled'));

alter table public.customer_inquiries add column if not exists estimated_total numeric(10,2) default 0;
alter table public.customer_inquiries add column if not exists preferred_contact text default 'whatsapp';

