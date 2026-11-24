-- Reliable incremental sync cursors and idempotency guards.
-- Realtime is notification-only; clients always reconcile through these indexed queries.

create index if not exists categories_sync_cursor_idx on public.categories (user_id, updated_at, id);
create index if not exists tasks_sync_cursor_idx on public.tasks (user_id, updated_at, id);
create index if not exists focus_sessions_sync_cursor_idx on public.focus_sessions (user_id, updated_at, id);
create index if not exists timer_states_sync_cursor_idx on public.timer_states (user_id, updated_at, id);
create index if not exists user_settings_sync_cursor_idx on public.user_settings (user_id, updated_at, id);

create unique index if not exists focus_sessions_source_idempotency_idx
  on public.focus_sessions (user_id, source_record_id)
  where source_record_id is not null;

do $$
declare table_name text;
begin
  foreach table_name in array array['categories','tasks','focus_sessions','timer_states','user_settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

-- timer_states already has a unique user_id constraint in the initial migration. Together
-- with version-checked updates this guarantees one authoritative timer state per user.
