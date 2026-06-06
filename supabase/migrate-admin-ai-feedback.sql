-- 管理画面 AI チャット / フィードバック用スキーマ
-- Supabase Dashboard > SQL Editor で実行してください。
-- 冪等: 重複実行しても安全です。

-- api_usage_logs.endpoint の許可値を、現在の API 実装に合わせて拡張する。
alter table public.api_usage_logs
  drop constraint if exists api_usage_logs_endpoint_check;

alter table public.api_usage_logs
  add constraint api_usage_logs_endpoint_check
  check (
    endpoint in (
      'ai-advisor',
      'detect-accessories',
      'keyword-suggest',
      'refine-keywords',
      'vision-identify',
      'bulk-import-image',
      'ai-chat',
      'mikomiku-estimate'
    )
  );

create table if not exists public.feedback_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  type text not null check (type in ('bug', 'feature', 'improvement', 'other')),
  author text,
  title text not null,
  body text not null,
  page_href text,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_logs_created_at_idx
  on public.feedback_logs(created_at desc);
create index if not exists feedback_logs_status_idx
  on public.feedback_logs(status);
create index if not exists feedback_logs_user_id_idx
  on public.feedback_logs(user_id);

alter table public.feedback_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_logs'
      and policyname = 'feedback_logs_select_authenticated'
  ) then
    create policy "feedback_logs_select_authenticated"
      on public.feedback_logs
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_logs'
      and policyname = 'feedback_logs_insert_authenticated'
  ) then
    create policy "feedback_logs_insert_authenticated"
      on public.feedback_logs
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_logs'
      and policyname = 'feedback_logs_update_authenticated'
  ) then
    create policy "feedback_logs_update_authenticated"
      on public.feedback_logs
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
