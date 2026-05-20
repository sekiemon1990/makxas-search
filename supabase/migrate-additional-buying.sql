-- ============================================================================
-- 追加買取トラッキング (Phase D)
-- 思想：「計測対象に追加買取指標を必ず含める」
-- ============================================================================
-- list_items に「追加買取フラグ」と「追加した担当者ID」を追加
-- - is_additional: 入口商品(false) / 追加買取(true)
-- - added_by_user_id: 誰が追加したかを記録（担当者別集計用）
-- ============================================================================

alter table public.list_items
  add column if not exists is_additional boolean not null default false;

alter table public.list_items
  add column if not exists added_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists list_items_is_additional_idx
  on public.list_items(is_additional);

create index if not exists list_items_added_by_user_id_idx
  on public.list_items(added_by_user_id);
