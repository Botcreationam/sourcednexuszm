-- Fix the mark_messages_read function to clear notifications correctly
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
    where inquiry_id = p_inquiry_id and is_admin and read_at is null;
    
    update public.customer_inquiries set has_unread_customer = false where id = p_inquiry_id;
  end if;
end;
$$ language plpgsql security definer;
