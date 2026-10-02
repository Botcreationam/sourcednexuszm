-- Fix triggers to bypass RLS when updating product_metrics
create or replace function public.handle_new_product_metrics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.product_metrics (product_id) values (new.id);
    return new;
end;
$$;

create or replace function public.handle_like_count_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        update public.product_metrics set like_count = like_count + 1 where product_id = new.product_id;
    elsif tg_op = 'DELETE' then
        update public.product_metrics set like_count = greatest(0, like_count - 1) where product_id = old.product_id;
    end if;
    return null;
end;
$$;

create or replace function public.handle_view_count_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        update public.product_metrics set view_count = view_count + 1 where product_id = new.product_id;
    end if;
    return null;
end;
$$;

create or replace function public.handle_review_metrics_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_avg numeric(3,2);
    v_count integer;
    v_prod uuid;
begin
    v_prod := coalesce(new.product_id, old.product_id);
    
    select count(*), coalesce(avg(rating), 0)
    into v_count, v_avg
    from public.product_reviews
    where product_id = v_prod and status = 'approved';
    
    update public.product_metrics 
    set review_count = v_count, average_rating = v_avg, updated_at = now()
    where product_id = v_prod;
    
    return null;
end;
$$;
