-- 見込金額ロジックの AIチューニング用スキーマ
-- Supabase Dashboard > SQL Editor で実行してください。
-- 冪等: 重複実行しても安全です。

-- 1) api_usage_logs.endpoint に AIチューニングチャットの値を追加
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
      'mikomiku-estimate',
      'mikomiku-tuning-chat'
    )
  );

-- 2) 見込金額ロジックの変更履歴（誰が・いつ・何を変えたか）
create table if not exists public.mikomiku_tuning_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  target text not null check (target in ('global', 'category')),
  category_id uuid references public.mikomiku_categories(id) on delete set null,
  category_name text,
  before_prompt text,
  after_prompt text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists mikomiku_tuning_log_created_at_idx
  on public.mikomiku_tuning_log(created_at desc);
create index if not exists mikomiku_tuning_log_target_idx
  on public.mikomiku_tuning_log(target);

alter table public.mikomiku_tuning_log enable row level security;

-- 認証済みユーザーは履歴を閲覧可（書き込みは service role 経由の API のみ）
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mikomiku_tuning_log'
      and policyname = 'mikomiku_tuning_log_select_authenticated'
  ) then
    create policy "mikomiku_tuning_log_select_authenticated"
      on public.mikomiku_tuning_log
      for select
      to authenticated
      using (true);
  end if;
end $$;

-- 3) app_config（全体ロジック mikomiku_prompt の保存先）が無ければ作成
--    既存環境では作成済みのはず（冪等）。
create table if not exists public.app_config (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_config'
      and policyname = 'app_config_select_authenticated'
  ) then
    create policy "app_config_select_authenticated"
      on public.app_config
      for select
      to authenticated
      using (true);
  end if;
end $$;
