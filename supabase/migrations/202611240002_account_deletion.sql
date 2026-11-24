-- Authenticated self-service account deletion. The caller can only delete auth.uid().
-- Business rows are removed by their existing ON DELETE CASCADE foreign keys.

create or replace function public.delete_current_user()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from auth.users where id = auth.uid();
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.delete_current_user() from public, anon;
grant execute on function public.delete_current_user() to authenticated;
