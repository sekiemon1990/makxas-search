-- マクサスサーチ DB スキーマ v1
-- Supabase の SQL Editor で実行してください

-- ============================================================================
-- 拡張機能
-- ============================================================================
create extension if not exists "uuid-ossp";

-- ============================================================================
-- ユーザープロファイル（auth.users と 1:1）
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  default_buy_rate int default 70 check (default_buy_rate between 0 and 100),
  font_scale numeric default 1.0,
  haptic_enabled boolean default true,
  reduced_motion boolean default false,
  theme text check (theme in ('light', 'dark')) default null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 新規ユーザー作成時に自動でプロファイルを作る
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- 検索（実行された検索とその結果）
-- ============================================================================
create table if not exists public.searches (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  keyword text not null,
  excludes text,
  period text not null check (period in ('30', '90', 'all')),
  sources text[] not null,
  conditions text[] default '{}'::text[],
  shipping text default 'any' check (shipping in ('any', 'free', 'paid')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'error', 'cancelled')),
  progress int default 0,
  -- サマリー結果
  median int,
  min_price int,
  max_price int,
  total_count int,
  product_guess text,
  -- メタ
  searched_at timestamptz default now(),
  completed_at timestamptz,
  expires_at timestamptz default now() + interval '24 hours',
  error_message text
);

create index if not exists searches_user_id_idx on public.searches(user_id);
create index if not exists searches_keyword_idx on public.searches using gin(to_tsvector('simple', keyword));
create index if not exists searches_searched_at_idx on public.searches(searched_at desc);
create index if not exists searches_status_idx on public.searches(status);

-- ============================================================================
-- 取得した出品（落札・売切・出品中の各レコード）
-- ============================================================================
create table if not exists public.listings (
  id uuid primary key default uuid_generate_v4(),
  search_id uuid not null references public.searches(id) on delete cascade,
  source text not null check (source in ('yahoo_auction', 'mercari', 'jimoty')),
  external_id text not null,  -- 媒体側の商品ID
  title text not null,
  price int not null,
  ended_at timestamptz not null,
  url text not null,
  thumbnail text,
  images text[],
  bid_count int,
  condition text,
  description text,
  seller_name text,
  shipping text check (shipping in ('free', 'paid', 'pickup')),
  shipping_info text,
  location text,
  accessories text[],
  -- メタ
  fetched_at timestamptz default now()
);

create index if not exists listings_search_id_idx on public.listings(search_id);
create index if not exists listings_source_idx on public.listings(source);

-- ============================================================================
-- 査定リスト
-- ============================================================================
create table if not exists public.appraisal_lists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists appraisal_lists_user_id_idx on public.appraisal_lists(user_id);
create index if not exists appraisal_lists_updated_at_idx on public.appraisal_lists(updated_at desc);

-- ユーザーが現在使っているリスト
create table if not exists public.user_current_list (
  user_id uuid primary key references auth.users(id) on delete cascade,
  list_id uuid not null references public.appraisal_lists(id) on delete cascade,
  updated_at timestamptz default now()
);

-- 査定リストの中の項目（searches テーブルとの紐付け）
create table if not exists public.list_items (
  id uuid primary key default uuid_generate_v4(),
  list_id uuid not null references public.appraisal_lists(id) on delete cascade,
  search_id uuid not null references public.searches(id) on delete cascade,
  added_at timestamptz default now(),
  unique (list_id, search_id)
);

create index if not exists list_items_list_id_idx on public.list_items(list_id);

-- ============================================================================
-- メモ（検索単位 / 商品単位）
-- ============================================================================
create table if not exists public.memos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 検索メモ or 商品メモ（どちらか片方が NULL）
  search_keyword text,    -- 検索メモはキーワードで紐付け
  listing_ref text,       -- 商品メモは "source-external_id" で紐付け
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (search_keyword is not null or listing_ref is not null)
);

create unique index if not exists memos_user_search_idx on public.memos(user_id, search_keyword) where search_keyword is not null;
create unique index if not exists memos_user_listing_idx on public.memos(user_id, listing_ref) where listing_ref is not null;

-- ============================================================================
-- ピン留め（検索単位 / 商品単位）
-- ============================================================================
create table if not exists public.pins (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_keyword text,
  listing_ref text,
  pinned_at timestamptz default now(),
  check (search_keyword is not null or listing_ref is not null)
);

create unique index if not exists pins_user_search_idx on public.pins(user_id, search_keyword) where search_keyword is not null;
create unique index if not exists pins_user_listing_idx on public.pins(user_id, listing_ref) where listing_ref is not null;

-- ============================================================================
-- 閲覧履歴
-- ============================================================================
create table if not exists public.listing_views (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_ref text not null,
  source text not null,
  title text not null,
  price int not null,
  thumbnail text,
  ended_at timestamptz not null,
  condition text,
  from_keyword text,
  viewed_at timestamptz default now()
);

create index if not exists listing_views_user_id_idx on public.listing_views(user_id);
create index if not exists listing_views_viewed_at_idx on public.listing_views(viewed_at desc);

-- ============================================================================
-- AI 査定アドバイス（保存版）
-- ============================================================================
create table if not exists public.saved_advices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_keyword text not null,
  product_guess text,
  summary text not null,
  recommendations jsonb not null,
  warnings jsonb not null,
  saved_at timestamptz default now(),
  unique (user_id, search_keyword)
);

create index if not exists saved_advices_user_idx on public.saved_advices(user_id, saved_at desc);

-- ============================================================================
-- Row Level Security: 自分のデータしか見られないように
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.searches enable row level security;
alter table public.listings enable row level security;
alter table public.appraisal_lists enable row level security;
alter table public.user_current_list enable row level security;
alter table public.list_items enable row level security;
alter table public.memos enable row level security;
alter table public.pins enable row level security;
alter table public.listing_views enable row level security;
alter table public.saved_advices enable row level security;

-- profiles: 自分の行のみ
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- searches: 自分の行のみ
create policy "searches_select_own" on public.searches for select using (auth.uid() = user_id);
create policy "searches_insert_own" on public.searches for insert with check (auth.uid() = user_id);
create policy "searches_update_own" on public.searches for update using (auth.uid() = user_id);
create policy "searches_delete_own" on public.searches for delete using (auth.uid() = user_id);

-- listings: 自分の検索に紐づく行のみ
create policy "listings_select_via_search" on public.listings for select
  using (exists (select 1 from public.searches s where s.id = listings.search_id and s.user_id = auth.uid()));
create policy "listings_insert_via_search" on public.listings for insert
  with check (exists (select 1 from public.searches s where s.id = listings.search_id and s.user_id = auth.uid()));

-- appraisal_lists: 自分の行のみ
create policy "lists_select_own" on public.appraisal_lists for select using (auth.uid() = user_id);
create policy "lists_insert_own" on public.appraisal_lists for insert with check (auth.uid() = user_id);
create policy "lists_update_own" on public.appraisal_lists for update using (auth.uid() = user_id);
create policy "lists_delete_own" on public.appraisal_lists for delete using (auth.uid() = user_id);

-- user_current_list
create policy "current_list_own" on public.user_current_list for all using (auth.uid() = user_id);

-- list_items: 自分のリストの項目のみ
create policy "list_items_select" on public.list_items for select
  using (exists (select 1 from public.appraisal_lists l where l.id = list_items.list_id and l.user_id = auth.uid()));
create policy "list_items_insert" on public.list_items for insert
  with check (exists (select 1 from public.appraisal_lists l where l.id = list_items.list_id and l.user_id = auth.uid()));
create policy "list_items_delete" on public.list_items for delete
  using (exists (select 1 from public.appraisal_lists l where l.id = list_items.list_id and l.user_id = auth.uid()));

-- memos / pins / listing_views / saved_advices: 自分の行のみ
create policy "memos_own" on public.memos for all using (auth.uid() = user_id);
create policy "pins_own" on public.pins for all using (auth.uid() = user_id);
create policy "listing_views_own" on public.listing_views for all using (auth.uid() = user_id);
create policy "saved_advices_own" on public.saved_advices for all using (auth.uid() = user_id);

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

-- ============================================================================
-- 期限切れの検索結果を自動削除（24時間後）
-- ============================================================================
-- Supabase の cron 拡張を使う場合（Pro プラン）または定期的に手動実行:
-- delete from public.searches where expires_at < now() and id not in (select search_id from public.list_items);
