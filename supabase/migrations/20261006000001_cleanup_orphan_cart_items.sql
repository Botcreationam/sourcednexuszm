-- Clean up ghost cart lines left behind by the cross-account cart leak.
--
-- Before the client fix, a logged-out browser could re-persist the previous
-- user's cart and merge it into the next account that signed in, so some
-- user_profiles.cart arrays contain lines that were never added by that user.
-- We cannot tell "leaked" from "legitimate" by owner, so this only removes lines
-- that are provably invalid:
--   * the product id no longer exists in public.products
--   * the line has no usable id
-- Everything else (real products, real quantities) is left untouched.
-- Idempotent: safe to run more than once.

update public.user_profiles up
set cart = coalesce((
  select jsonb_agg(item)
  from jsonb_array_elements(up.cart) as item
  where coalesce(item->>'id', '') <> ''
    and exists (
      select 1 from public.products p
      where p.id::text = item->>'id'
    )
), '[]'::jsonb)
where jsonb_typeof(up.cart) = 'array'
  and jsonb_array_length(up.cart) > 0
  and exists (
    select 1
    from jsonb_array_elements(up.cart) as item
    where coalesce(item->>'id', '') = ''
       or not exists (
         select 1 from public.products p
         where p.id::text = item->>'id'
       )
  );
