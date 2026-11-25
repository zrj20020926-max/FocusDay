-- Focus Day habits: independent habit definitions, idempotent daily records,
-- and optional focus-session attribution. All rows remain user isolated by RLS.

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '',
  icon text not null default 'Sparkles',
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  goal_type text not null check (goal_type in ('DAILY_CHECKIN', 'DAILY_DURATION', 'WEEKLY_COUNT')),
  target_value bigint not null check (target_value > 0),
  frequency text not null check (frequency in ('DAILY', 'WEEKDAYS', 'WEEKLY_TARGET')),
  weekdays smallint[] not null default '{}',
  weekly_target integer not null default 1 check (weekly_target > 0),
  start_date date not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  constraint habits_weekdays_valid check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

create table public.habit_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  record_date date not null,
  actual_value bigint not null default 0 check (actual_value >= 0),
  manual_value bigint not null default 0 check (manual_value >= 0),
  focus_session_ids uuid[] not null default '{}',
  completed boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, habit_id, record_date),
  constraint habit_records_habit_owner_fk foreign key (habit_id, user_id)
    references public.habits(id, user_id)
);

alter table public.focus_sessions add column habit_id uuid,
  add column active_intervals jsonb check (active_intervals is null or jsonb_typeof(active_intervals) = 'array');
alter table public.focus_sessions add constraint focus_sessions_habit_owner_fk
  foreign key (habit_id, user_id) references public.habits(id, user_id);

create index habits_user_status_idx on public.habits (user_id, status) where deleted_at is null;
create index habits_sync_cursor_idx on public.habits (user_id, updated_at, id);
create index habit_records_habit_date_idx on public.habit_records (habit_id, record_date desc) where deleted_at is null;
create index habit_records_sync_cursor_idx on public.habit_records (user_id, updated_at, id);
create index focus_sessions_habit_end_idx on public.focus_sessions (habit_id, end_time desc) where deleted_at is null;

do $$
declare table_name text;
begin
  foreach table_name in array array['habits','habit_records'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy %I_select_own on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name, table_name);
    execute format('create policy %I_insert_own on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name, table_name);
    execute format('create policy %I_update_own on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name, table_name);
    execute format('create policy %I_delete_own on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', table_name, table_name);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
