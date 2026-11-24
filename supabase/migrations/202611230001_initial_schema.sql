-- Focus Day cloud schema. Run with Supabase CLI or in the SQL editor.
-- Browser clients must use only the publishable/anon key; RLS is the security boundary.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'Asia/Shanghai',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null,
  is_default boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create unique index categories_active_name_per_user
  on public.categories (user_id, lower(name)) where deleted_at is null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 500),
  description text not null default '',
  category_id uuid,
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH')),
  status text not null default 'TODO' check (status in ('TODO', 'IN_PROGRESS', 'COMPLETED')),
  planned_date date,
  due_date date,
  estimated_duration integer not null default 0 check (estimated_duration >= 0),
  estimated_pomodoros integer not null default 0 check (estimated_pomodoros >= 0),
  sort_order integer not null default 0,
  completed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  constraint tasks_category_owner_fk foreign key (category_id, user_id)
    references public.categories(id, user_id)
);

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid,
  mode text not null check (mode in ('POMODORO', 'STOPWATCH', 'COUNTDOWN')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration bigint not null check (duration >= 0),
  status text not null check (status in ('COMPLETED', 'CANCELLED')),
  source_record_id text,
  completed_naturally boolean not null default false,
  completed_pomodoros integer not null default 0 check (completed_pomodoros >= 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint focus_sessions_time_order check (end_time >= start_time),
  constraint focus_sessions_task_owner_fk foreign key (task_id, user_id)
    references public.tasks(id, user_id)
);

create table public.timer_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (length(btrim(key)) between 1 and 120),
  value jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, key)
);

create index tasks_user_status_sort_idx on public.tasks (user_id, status, sort_order) where deleted_at is null;
create index tasks_user_planned_date_idx on public.tasks (user_id, planned_date) where deleted_at is null;
create index tasks_user_due_date_idx on public.tasks (user_id, due_date) where deleted_at is null;
create index categories_user_idx on public.categories (user_id) where deleted_at is null;
create index focus_sessions_user_end_idx on public.focus_sessions (user_id, end_time desc) where deleted_at is null;
create index focus_sessions_task_end_idx on public.focus_sessions (task_id, end_time desc) where deleted_at is null;
create index user_settings_user_idx on public.user_settings (user_id) where deleted_at is null;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','categories','tasks','focus_sessions','timer_states','user_settings'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy %I_select_own on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name, table_name);
    execute format('create policy %I_insert_own on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name, table_name);
    execute format('create policy %I_update_own on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name, table_name);
    execute format('create policy %I_delete_own on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', table_name, table_name);
  end loop;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, user_id, display_name)
  values (new.id, new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.soft_delete_category(category_to_delete uuid, replacement_category uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if category_to_delete = replacement_category then return false; end if;
  if not exists (select 1 from public.categories where id = category_to_delete and user_id = auth.uid() and deleted_at is null) then return false; end if;
  if not exists (select 1 from public.categories where id = replacement_category and user_id = auth.uid() and deleted_at is null) then return false; end if;

  update public.tasks set category_id = replacement_category, version = version + 1
    where category_id = category_to_delete and user_id = auth.uid() and deleted_at is null;
  update public.categories set deleted_at = now(), version = version + 1
    where id = category_to_delete and user_id = auth.uid() and deleted_at is null;
  return found;
end;
$$;

revoke all on function public.soft_delete_category(uuid, uuid) from public;
grant execute on function public.soft_delete_category(uuid, uuid) to authenticated;
