-- Run on a disposable database after migrations. Replace the two auth user
-- UUIDs with accounts in that project. The transaction rolls back fixtures.
begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

insert into public.habits (id, user_id, name, color, goal_type, target_value, frequency, start_date)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', auth.uid(), 'RLS habit', '#92aa8b', 'DAILY_CHECKIN', 1, 'DAILY', '2026-11-25');

insert into public.habit_records (id, user_id, habit_id, record_date, manual_value, actual_value, completed)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', auth.uid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '2026-11-25', 1, 1, true);

do $$
begin
  if not exists (select from public.habits where name = 'RLS habit')
    or not exists (select from public.habit_records where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02') then
    raise exception 'owner must see their habit and check-in';
  end if;
  begin
    insert into public.habit_records (user_id, habit_id, record_date)
    values (auth.uid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '2026-11-25');
    raise exception 'duplicate habit day accepted';
  exception when unique_violation then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

do $$
begin
  if exists (select from public.habits where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01')
    or exists (select from public.habit_records where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02') then
    raise exception 'habit data visible across accounts';
  end if;
  update public.habits set name = 'forbidden' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  if found then raise exception 'cross-account habit update accepted'; end if;
  delete from public.habit_records where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02';
  if found then raise exception 'cross-account check-in delete accepted'; end if;
  begin
    insert into public.habit_records (user_id, habit_id, record_date)
    values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '2026-11-26');
    raise exception 'cross-account check-in insert accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.focus_sessions (user_id, habit_id, mode, start_time, end_time, duration, status)
    values (auth.uid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'STOPWATCH', now(), now(), 0, 'COMPLETED');
    raise exception 'cross-account focus attribution accepted';
  exception when foreign_key_violation then null;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.habit_records;
    raise exception 'anonymous habit record read accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
