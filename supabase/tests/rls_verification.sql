-- Run against a disposable Supabase project after applying migrations.
-- Replace the UUIDs with two auth.users IDs created through Supabase Auth.
begin;

-- User A may only create rows carrying User A's ID.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

insert into public.categories (id, user_id, name, color, icon)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'RLS A', '#92AA8B', 'Tag');

-- Expected: 1
select count(*) as own_rows_visible from public.categories where name = 'RLS A';

-- Switch to User B. Expected: 0 rows returned.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select count(*) as other_rows_hidden from public.categories where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Expected: UPDATE 0 and DELETE 0.
update public.categories set name = 'forbidden' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from public.categories where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Expected: RLS with-check violation (run separately because it aborts the transaction).
-- insert into public.categories (user_id, name, color, icon)
-- values ('11111111-1111-4111-8111-111111111111', 'forbidden', '#92AA8B', 'Tag');

rollback;
