-- ADR-0008: 読み取り専用デモアカウント
--
-- 方針:
-- - 既存 RLS を緩めない。
-- - profiles.is_readonly=true の通常ユーザーによる public schema の INSERT/UPDATE/DELETE を
--   追加 trigger で最終拒否する。
-- - service_role / maintenance / provision scripts は auth.uid() が無いため対象外。

alter table if exists public.profiles
  add column if not exists is_readonly boolean not null default false;

create index if not exists profiles_is_readonly_idx
  on public.profiles(is_readonly)
  where is_readonly = true;

comment on column public.profiles.is_readonly is
  'ADR-0008: true のユーザーは読み取り専用デモ。通常認証経由の public table write を trigger で拒否する。';

create or replace function public.search_current_user_is_readonly()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_readonly = true
  );
$$;

revoke all on function public.search_current_user_is_readonly() from public;
grant execute on function public.search_current_user_is_readonly() to authenticated, service_role;

create or replace function public.search_enforce_not_readonly()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and public.search_current_user_is_readonly() then
    raise exception using
      errcode = '42501',
      message = 'readonly_demo_write_denied',
      detail = 'ADR-0008 read-only demo accounts cannot insert, update, or delete rows.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.search_enforce_not_readonly() from public;
grant execute on function public.search_enforce_not_readonly() to authenticated, service_role;

do $$
declare
  target_table record;
begin
  for target_table in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname not like 'pg_%'
  loop
    execute format(
      'drop trigger if exists search_readonly_demo_guard on public.%I',
      target_table.table_name
    );
    execute format(
      'create trigger search_readonly_demo_guard before insert or update or delete on public.%I for each row execute function public.search_enforce_not_readonly()',
      target_table.table_name
    );
  end loop;
end $$;
