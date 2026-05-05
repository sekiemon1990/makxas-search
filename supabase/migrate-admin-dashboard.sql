-- 管理ダッシュボード用テーブル追加 (Phase A: 管理画面)
-- Supabase Dashboard > SQL Editor で実行してください

-- ============================================================================
-- API 使用量ログ（Anthropic API 呼び出しごとに記録）
-- ============================================================================
create table if not exists public.api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  endpoint text not null check (endpoint in ('ai-advisor', 'detect-accessories', 'keyword-suggest', 'refine-keywords')),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz default now()
);

create index if not exists api_usage_logs_created_at_idx on public.api_usage_logs(created_at desc);
create index if not exists api_usage_logs_user_id_idx on public.api_usage_logs(user_id);
create index if not exists api_usage_logs_endpoint_idx on public.api_usage_logs(endpoint);

-- RLS: 通常ユーザーはアクセス不可。service role は RLS をバイパスするため操作可能
alter table public.api_usage_logs enable row level security;
create policy "api_usage_logs_deny_all" on public.api_usage_logs using (false);
