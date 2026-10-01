-- ============================================================================
-- SOURCED NEXUS — MESSAGING & REVIEWS UPDATE
-- ============================================================================

-- 1. UPDATE PRODUCT REVIEWS TABLE
-- Add missing columns and change default status to pending
alter table public.product_reviews 
add column if not exists title text,
add column if not exists experience_details text,
alter column status set default 'pending';

-- 2. ENHANCE CUSTOMER INQUIRIES FOR INBOX
-- Ensure we have fields to track conversation state
alter table public.customer_inquiries
add column if not exists has_unread_admin boolean not null default true,
add column if not exists has_unread_customer boolean not null default false;

-- 2.5 UPDATE PRODUCT COMMENTS
alter table public.product_comments
add column if not exists user_name text not null default 'Anonymous';

-- 3. FUNCTION TO UPSERT REVIEWS
-- Safely insert or update a review, resetting status to pending
create or replace function public.upsert_product_review(
  p_product_id uuid,
  p_rating integer,
  p_title text,
  p_review_text text,
  p_experience_details text
) returns void as $$
begin
  insert into public.product_reviews (
    product_id, user_id, rating, title, review_text, experience_details, status
  ) values (
    p_product_id, auth.uid(), p_rating, p_title, p_review_text, p_experience_details, 'pending'
  )
  on conflict (product_id, user_id) do update set
    rating = excluded.rating,
    title = excluded.title,
    review_text = excluded.review_text,
    experience_details = excluded.experience_details,
    status = 'pending',
    updated_at = now();
end;
$$ language plpgsql security invoker;

-- 4. FUNCTION TO MARK MESSAGES AS READ
create or replace function public.mark_messages_read(p_inquiry_id uuid, p_is_admin boolean)
returns void as $$
begin
  if p_is_admin then
    update public.customer_inquiry_messages 
    set read_at = now() 
    where inquiry_id = p_inquiry_id and not is_admin and read_at is null;
    
    update public.customer_inquiries set has_unread_admin = false where id = p_inquiry_id;
  else
    update public.customer_inquiry_messages 
    set read_at = now() 
    where inquiry_id = p_inquiry_id and is_admin and read_at is null
    and user_id = auth.uid(); -- ensure user owns the inquiry
    
    update public.customer_inquiries set has_unread_customer = false where id = p_inquiry_id;
  end if;
end;
$$ language plpgsql security invoker;

-- 5. TRIGGER ON NEW MESSAGE TO SET UNREAD STATUS
create or replace function public.handle_message_unread_status()
returns trigger as $$
begin
  if new.is_admin then
    update public.customer_inquiries set has_unread_customer = true where id = new.inquiry_id;
  else
    update public.customer_inquiries set has_unread_admin = true where id = new.inquiry_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_new_message_unread on public.customer_inquiry_messages;
create trigger on_new_message_unread
  after insert on public.customer_inquiry_messages
  for each row
  execute function public.handle_message_unread_status();
