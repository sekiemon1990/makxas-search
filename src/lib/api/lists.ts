"use client";

import { createClient } from "@/lib/supabase/client";
import type { SourceKey } from "@/lib/types";
import type { ConditionRank } from "@/lib/conditions";
import type { Period, ShippingFilter } from "@/components/SearchFormFields";

export type ListItemStatus =
  | "queued"
  | "running"
  | "completed"
  | "error"
  | "cancelled";

export type ListItemQuery = {
  keyword: string;
  excludes?: string;
  period: Period;
  sources: SourceKey[];
  conditions: ConditionRank[];
  shipping: ShippingFilter;
  listingStatus?: "sold" | "active";
  sellerType?: "all" | "store" | "individual";
};

export type ListItemResult = {
  median: number;
  min: number;
  max: number;
  count: number;
  suggestedBuyPrice: number;
};

export type ListItem = {
  id: string;
  query: ListItemQuery;
  status: ListItemStatus;
  progress: number;
  result?: ListItemResult;
  error?: string;
  addedAt: string;
  startedAt?: string;
  targetCompleteAt?: number;
  totalMs?: number;
  completedAt?: string;
  notes?: string;
};

export type AppraisalList = {
  id: string;
  name?: string;
  items: ListItem[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

// ============================================================================
// 行 → ドメインモデルへのマッピング
// ============================================================================

type ListRow = {
  id: string;
  user_id: string;
  name: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  list_id: string;
  keyword: string;
  excludes: string | null;
  period: string;
  sources: string[];
  conditions: string[];
  shipping: string;
  status: string;
  progress: number;
  median: number | null;
  min_price: number | null;
  max_price: number | null;
  total_count: number | null;
  suggested_buy_price: number | null;
  error_message: string | null;
  added_at: string;
  started_at: string | null;
  completed_at: string | null;
  total_ms: number | null;
  target_complete_at_ms: number | null;
  notes: string | null;
};

function rowToItem(row: ItemRow): ListItem {
  const item: ListItem = {
    id: row.id,
    query: {
      keyword: row.keyword,
      excludes: row.excludes ?? undefined,
      period: row.period as Period,
      sources: row.sources as SourceKey[],
      conditions: row.conditions as ConditionRank[],
      shipping: row.shipping as ShippingFilter,
    },
    status: row.status as ListItemStatus,
    progress: row.progress,
    addedAt: row.added_at,
  };
  if (row.median !== null) {
    item.result = {
      median: row.median,
      min: row.min_price ?? 0,
      max: row.max_price ?? 0,
      count: row.total_count ?? 0,
      suggestedBuyPrice: row.suggested_buy_price ?? 0,
    };
  }
  if (row.error_message) item.error = row.error_message;
  if (row.started_at) item.startedAt = row.started_at;
  if (row.completed_at) item.completedAt = row.completed_at;
  if (row.total_ms !== null) item.totalMs = Math.floor(row.total_ms);
  if (row.target_complete_at_ms !== null) {
    item.targetCompleteAt = Math.floor(row.target_complete_at_ms);
  }
  if (row.notes) item.notes = row.notes;
  return item;
}

// ============================================================================
// 公開 API
// ============================================================================

export async function fetchAllListsWithItems(): Promise<AppraisalList[]> {
  const supabase = createClient();
  const { data: lists, error: listsError } = await supabase
    .from("appraisal_lists")
    .select("*")
    .order("updated_at", { ascending: false });
  if (listsError) {
    console.error("[lists] fetchAll lists error:", listsError);
    return [];
  }
  const { data: items, error: itemsError } = await supabase
    .from("list_items")
    .select("*")
    .order("added_at", { ascending: false });
  if (itemsError) {
    console.error("[lists] fetchAll items error:", itemsError);
  }

  const itemsByList = new Map<string, ListItem[]>();
  for (const row of (items ?? []) as ItemRow[]) {
    const arr = itemsByList.get(row.list_id) ?? [];
    arr.push(rowToItem(row));
    itemsByList.set(row.list_id, arr);
  }

  return ((lists ?? []) as ListRow[]).map((l) => ({
    id: l.id,
    name: l.name ?? undefined,
    items: itemsByList.get(l.id) ?? [],
    createdAt: l.created_at,
    updatedAt: l.updated_at,
    archivedAt: l.archived_at ?? undefined,
  }));
}

export async function fetchCurrentListId(): Promise<string | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("user_current_list")
    .select("list_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) console.error("[lists] fetchCurrentListId error:", error);
  return data?.list_id ?? null;
}

export async function setCurrentListId(listId: string): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const { error } = await supabase.from("user_current_list").upsert(
    {
      user_id: userData.user.id,
      list_id: listId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) console.error("[lists] setCurrentListId error:", error);
}

export async function clearCurrentListId(): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const { error } = await supabase
    .from("user_current_list")
    .delete()
    .eq("user_id", userData.user.id);
  if (error) console.error("[lists] clearCurrentListId error:", error);
}

export async function createListRow(name?: string): Promise<AppraisalList | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("appraisal_lists")
    .insert({ user_id: userData.user.id, name: name ?? null })
    .select()
    .single();
  if (error || !data) {
    console.error("[lists] createListRow error:", error);
    return null;
  }
  const row = data as ListRow;
  return {
    id: row.id,
    name: row.name ?? undefined,
    items: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined,
  };
}

export async function deleteListRow(listId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisal_lists")
    .delete()
    .eq("id", listId);
  if (error) console.error("[lists] deleteListRow error:", error);
}

export async function renameListRow(listId: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisal_lists")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", listId);
  if (error) console.error("[lists] renameListRow error:", error);
}

export async function touchListRow(listId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisal_lists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", listId);
  if (error) console.error("[lists] touchListRow error:", error);
}

export async function insertListItem(
  listId: string,
  query: ListItemQuery,
  initial?: { status?: ListItemStatus; result?: ListItemResult }
): Promise<ListItem | null> {
  const supabase = createClient();
  const status = initial?.status ?? "queued";
  const result = initial?.result;
  const { data, error } = await supabase
    .from("list_items")
    .insert({
      list_id: listId,
      keyword: query.keyword,
      excludes: query.excludes ?? null,
      period: query.period,
      sources: query.sources,
      conditions: query.conditions,
      shipping: query.shipping,
      status,
      progress: status === "completed" ? 100 : 0,
      median: result?.median ?? null,
      min_price: result?.min ?? null,
      max_price: result?.max ?? null,
      total_count: result?.count ?? null,
      suggested_buy_price: result?.suggestedBuyPrice ?? null,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error || !data) {
    console.error("[lists] insertListItem error:", error);
    return null;
  }
  // リスト側の updated_at を更新
  touchListRow(listId).catch(() => {});
  return rowToItem(data as ItemRow);
}

export async function updateListItem(
  itemId: string,
  updates: Partial<ListItem>
): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.progress !== undefined) patch.progress = Math.floor(updates.progress);
  if (updates.startedAt !== undefined) patch.started_at = updates.startedAt;
  if (updates.completedAt !== undefined) patch.completed_at = updates.completedAt;
  if (updates.totalMs !== undefined) patch.total_ms = Math.floor(updates.totalMs);
  if (updates.targetCompleteAt !== undefined) {
    patch.target_complete_at_ms = Math.floor(updates.targetCompleteAt);
  }
  if (updates.error !== undefined) patch.error_message = updates.error;
  if (updates.notes !== undefined) patch.notes = updates.notes || null;
  if (updates.result !== undefined) {
    patch.median = updates.result.median;
    patch.min_price = updates.result.min;
    patch.max_price = updates.result.max;
    patch.total_count = updates.result.count;
    patch.suggested_buy_price = updates.result.suggestedBuyPrice;
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .from("list_items")
    .update(patch)
    .eq("id", itemId);
  if (error) console.error("[lists] updateListItem error:", error);
}

export async function deleteListItem(itemId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("list_items")
    .delete()
    .eq("id", itemId);
  if (error) console.error("[lists] deleteListItem error:", error);
}

export async function clearListItems(listId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("list_items")
    .delete()
    .eq("list_id", listId);
  if (error) console.error("[lists] clearListItems error:", error);
}
