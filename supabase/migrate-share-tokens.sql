-- ============================================================================
-- 共有トークン (Phase B: 共有機能)
-- ============================================================================

create table if not exists public.share_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  resource_type text not null check (resource_type in ('search', 'list', 'listing')),
  resource_id text not null,          -- searches.id / appraisal_lists.id / listings.id
  permission text not null default 'view' check (permission in ('view', 'edit')),
  created_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.share_tokens enable row level security;

-- 誰でもトークンを取得して閲覧可能（URLを知っている人のみ）
create policy "share_tokens_anyone_read"
  on public.share_tokens for select using (true);

-- ログイン済みユーザーは自分のトークンを作成可能
create policy "share_tokens_owner_insert"
  on public.share_tokens for insert with check (auth.uid() = created_by);

-- 自分が作ったトークンのみ削除可能
create policy "share_tokens_owner_delete"
  on public.share_tokens for delete using (auth.uid() = created_by);

create index if not exists share_tokens_token_idx
  on public.share_tokens(token);

create index if not exists share_tokens_resource_idx
  on public.share_tokens(resource_type, resource_id);

-- ============================================================================
-- list_items に査定ステータス追加 (Phase C: 共同編集)
-- ============================================================================

alter table public.list_items
  add column if not exists appraisal_status text
    not null default 'pending'
    check (appraisal_status in ('pending', 'accepted', 'rejected'));
