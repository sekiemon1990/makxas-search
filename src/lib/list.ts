"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryClient } from "@/components/QueryProvider";
import {
  fetchAllListsWithItems,
  fetchCurrentListId,
  setCurrentListId as apiSetCurrentListId,
  clearCurrentListId,
  createListRow,
  deleteListRow,
  renameListRow,
  insertListItem,
  updateListItem,
  deleteListItem as apiDeleteListItem,
  clearListItems,
  updateItemsSortOrder,
  type AppraisalList,
  type ListItem,
  type ListItemQuery,
  type ListItemResult,
  type ListItemStatus,
} from "./api/lists";
import { toast } from "./toast";
import { createClient } from "@/lib/supabase/client";

export type {
  AppraisalList,
  ListItem,
  ListItemQuery,
  ListItemResult,
  ListItemStatus,
};

const MAX_PARALLEL = 3;
const PREFIX = "maxus_search:";

// ============================================================================
// 端末ローカル: クイック追加用デフォルト検索条件
// ============================================================================

import type { SourceKey } from "./types";
import type { ConditionRank } from "./conditions";
import type { Period, ShippingFilter } from "@/components/SearchFormFields";

const DEFAULT_QUERY_KEY = "default_query";

export type DefaultQuery = Omit<ListItemQuery, "keyword">;

const FALLBACK_DEFAULT_QUERY: DefaultQuery = {
  excludes: "",
  period: "90",
  sources: ["yahoo_auction", "mercari", "jimoty"],
  conditions: [],
  shipping: "any",
};

function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
    window.dispatchEvent(
      new CustomEvent("maxus_search:list", { detail: { key } })
    );
  } catch {
    // noop
  }
}

export function getDefaultQuery(): DefaultQuery {
  const raw = readLocal(DEFAULT_QUERY_KEY);
  if (!raw) return FALLBACK_DEFAULT_QUERY;
  try {
    const parsed = JSON.parse(raw);
    return { ...FALLBACK_DEFAULT_QUERY, ...parsed };
  } catch {
    return FALLBACK_DEFAULT_QUERY;
  }
}

export function setDefaultQuery(query: DefaultQuery): void {
  writeLocal(DEFAULT_QUERY_KEY, JSON.stringify(query));
}

function subscribeListStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("maxus_search:list", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("maxus_search:list", callback);
    window.removeEventListener("storage", callback);
  };
}

// snapshot キャッシュ (useSyncExternalStore は同一参照を要求)
let cachedDefaultQuery: DefaultQuery = FALLBACK_DEFAULT_QUERY;
let cachedDefaultQueryKey = "";

function getDefaultQuerySnapshot(): DefaultQuery {
  const q = getDefaultQuery();
  const key = JSON.stringify(q);
  if (key === cachedDefaultQueryKey) return cachedDefaultQuery;
  cachedDefaultQueryKey = key;
  cachedDefaultQuery = q;
  return q;
}

export function useDefaultQuery(): [
  DefaultQuery,
  (q: Partial<DefaultQuery>) => void,
] {
  const q = useSyncExternalStore(
    subscribeListStorage,
    getDefaultQuerySnapshot,
    () => FALLBACK_DEFAULT_QUERY,
  );

  const update = (partial: Partial<DefaultQuery>) => {
    const next = { ...q, ...partial };
    setDefaultQuery(next);
    // setDefaultQuery → maxus_search:list イベント → snapshot 再読込
  };

  return [q, update];
}

// ============================================================================
// React Query キー
// ============================================================================

const LISTS_KEY = ["appraisal_lists"] as const;
const CURRENT_LIST_ID_KEY = ["current_list_id"] as const;

function defaultListName(): string {
  const d = new Date();
  return `査定リスト ${d.getMonth() + 1}/${d.getDate()}`;
}

// ============================================================================
// React Query フック
// ============================================================================

export function useAllLists(): AppraisalList[] {
  const { data } = useQuery({
    queryKey: LISTS_KEY,
    queryFn: fetchAllListsWithItems,
    placeholderData: [],
    staleTime: 0,
    refetchOnMount: "always",
  });
  return data ?? [];
}

function useCurrentListId(): string | null {
  const { data } = useQuery({
    queryKey: CURRENT_LIST_ID_KEY,
    queryFn: fetchCurrentListId,
    placeholderData: null,
    staleTime: 0,
    refetchOnMount: "always",
  });
  return data ?? null;
}

const EMPTY_LIST: AppraisalList = {
  id: "",
  items: [],
  createdAt: "1970-01-01T00:00:00.000Z",
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export function useCurrentList(): AppraisalList {
  const lists = useAllLists();
  const currentId = useCurrentListId();
  const qc = useQueryClient();

  // 初回ロード後、もしリストが 1 つも無ければ自動で 1 つ作る
  useEffect(() => {
    if (lists.length === 0 && currentId === null) return;
    if (lists.length === 0 && currentId !== null) return;
    if (currentId && !lists.find((l) => l.id === currentId)) {
      // current が消えてる → 先頭に切替
      if (lists[0]) {
        apiSetCurrentListId(lists[0].id).then(() => {
          qc.invalidateQueries({ queryKey: CURRENT_LIST_ID_KEY });
        });
      }
    }
  }, [lists, currentId, qc]);

  // running 中 / queued の項目があれば再開
  useEffect(() => {
    processQueue();
  });

  if (currentId) {
    const found = lists.find((l) => l.id === currentId);
    if (found) return found;
  }
  if (lists.length > 0) return lists[0];
  return EMPTY_LIST;
}

// 後方互換
export const useActiveList = useCurrentList;

export function useArchivedLists() {
  return useAllLists();
}

export function useIsInList(keyword: string): boolean {
  const lists = useAllLists();
  const currentId = useCurrentListId();
  const current = lists.find((l) => l.id === currentId) ?? lists[0];
  if (!current) return false;
  const trimmed = keyword.trim();
  return current.items.some((i) => i.query.keyword.trim() === trimmed);
}

/** 指定キーワードが現在のリストに存在するか + そのアイテムIDを返す */
export function useIsInListByKeyword(keyword: string | undefined): {
  isInList: boolean;
  existingItemId: string | null;
} {
  const lists = useAllLists();
  const currentId = useCurrentListId();
  const current = lists.find((l) => l.id === currentId) ?? lists[0];
  if (!current || !keyword) return { isInList: false, existingItemId: null };
  const trimmed = keyword.trim();
  const found = current.items.find((i) => i.query.keyword.trim() === trimmed);
  return { isInList: !!found, existingItemId: found?.id ?? null };
}

// ============================================================================
// 公開 API: リスト管理
// ============================================================================

function invalidateAll() {
  const qc = getQueryClient();
  if (!qc) return;
  qc.invalidateQueries({ queryKey: LISTS_KEY });
  qc.invalidateQueries({ queryKey: CURRENT_LIST_ID_KEY });
}

export async function createList(name?: string): Promise<AppraisalList | null> {
  const trimmed = name?.trim() || defaultListName();
  const list = await createListRow(trimmed);
  if (list) {
    await apiSetCurrentListId(list.id);
    invalidateAll();
  }
  return list;
}

export async function switchToList(id: string): Promise<void> {
  await apiSetCurrentListId(id);
  invalidateAll();
}

export async function deleteList(id: string): Promise<void> {
  await deleteListRow(id);
  // 残りの先頭を current にする
  const lists = await fetchAllListsWithItems();
  if (lists.length > 0) {
    await apiSetCurrentListId(lists[0].id);
  } else {
    await clearCurrentListId();
  }
  invalidateAll();
}

export async function renameList(id: string, name: string): Promise<void> {
  await renameListRow(id, name.trim() || defaultListName());
  invalidateAll();
}

// ============================================================================
// 公開 API: アイテム操作
// ============================================================================

async function getOrCreateCurrentListId(): Promise<string | null> {
  const existing = await fetchCurrentListId();
  if (existing) return existing;
  const lists = await fetchAllListsWithItems();
  if (lists.length > 0) {
    await apiSetCurrentListId(lists[0].id);
    return lists[0].id;
  }
  const created = await createListRow(defaultListName());
  if (!created) return null;
  await apiSetCurrentListId(created.id);
  return created.id;
}

export async function addItemToList(
  query: ListItemQuery,
  itemType: "search" | "listing" = "search"
): Promise<ListItem | null> {
  const listId = await getOrCreateCurrentListId();
  if (!listId) return null;
  const item = await insertListItem(listId, query, undefined, itemType);
  invalidateAll();
  if (item) processQueue();
  return item;
}

export async function addItemsToList(
  queries: ListItemQuery[]
): Promise<ListItem[]> {
  const listId = await getOrCreateCurrentListId();
  if (!listId) return [];
  const items: ListItem[] = [];
  for (const q of queries) {
    const item = await insertListItem(listId, q);
    if (item) items.push(item);
  }
  invalidateAll();
  if (items.length > 0) processQueue();
  return items;
}

export async function addCompletedItem(
  query: ListItemQuery,
  result: ListItemResult
): Promise<ListItem | null> {
  const listId = await getOrCreateCurrentListId();
  if (!listId) return null;

  // 既に同じキーワードがあればスキップ
  const lists = await fetchAllListsWithItems();
  const current = lists.find((l) => l.id === listId);
  const existing = current?.items.find(
    (i) => i.query.keyword.trim() === query.keyword.trim()
  );
  if (existing) return existing;

  const item = await insertListItem(listId, query, {
    status: "completed",
    result,
  });
  invalidateAll();
  return item;
}

export async function isInListAsync(keyword: string): Promise<boolean> {
  const listId = await fetchCurrentListId();
  if (!listId) return false;
  const lists = await fetchAllListsWithItems();
  const current = lists.find((l) => l.id === listId);
  if (!current) return false;
  const trimmed = keyword.trim();
  return current.items.some((i) => i.query.keyword.trim() === trimmed);
}

export async function removeItem(itemId: string): Promise<void> {
  await apiDeleteListItem(itemId);
  invalidateAll();
}

export async function updateItemNotes(itemId: string, notes: string): Promise<void> {
  await updateListItem(itemId, { notes });
  invalidateAll();
}

export async function reorderItems(orders: { id: string; sortOrder: number }[]): Promise<void> {
  await updateItemsSortOrder(orders);
  invalidateAll();
}

export async function cancelItem(itemId: string): Promise<void> {
  await updateListItem(itemId, { status: "cancelled" });
  invalidateAll();
  processQueue();
}

export async function clearCurrentList(): Promise<void> {
  const listId = await fetchCurrentListId();
  if (!listId) return;
  await clearListItems(listId);
  invalidateAll();
}

export async function saveCurrentAndCreateNew(
  name?: string
): Promise<AppraisalList | null> {
  const currentId = await fetchCurrentListId();
  if (currentId && name && name.trim()) {
    await renameListRow(currentId, name.trim());
  }
  return createList();
}

// 後方互換
export async function archiveCurrentList(name?: string): Promise<void> {
  await saveCurrentAndCreateNew(name);
}

export async function clearList(): Promise<void> {
  await clearCurrentList();
}

// ============================================================================
// バックグラウンドジョブ (モック)
// ============================================================================

const activeTickers = new Set<string>();

async function fetchItemById(itemId: string): Promise<ListItem | null> {
  const lists = await fetchAllListsWithItems();
  for (const l of lists) {
    const f = l.items.find((i) => i.id === itemId);
    if (f) return f;
  }
  return null;
}

function tick(itemId: string): void {
  if (activeTickers.has(itemId)) return;
  activeTickers.add(itemId);

  async function loop() {
    const found = await fetchItemById(itemId);
    if (!found || found.status !== "running") {
      activeTickers.delete(itemId);
      return;
    }

    if (!found.targetCompleteAt) {
      const total = Math.floor(1800 + Math.random() * 2600);
      await updateListItem(itemId, {
        targetCompleteAt: Date.now() + total,
        totalMs: total,
      });
      invalidateAll();
      setTimeout(loop, 100);
      return;
    }

    const total = found.totalMs ?? 3000;
    const remaining = found.targetCompleteAt - Date.now();
    if (remaining <= 0) {
      await completeItem(itemId);
      activeTickers.delete(itemId);
      processQueue();
      return;
    }
    const progress = Math.min(99, Math.round(((total - remaining) / total) * 100));
    await updateListItem(itemId, { progress });
    invalidateAll();
    setTimeout(loop, 500);
  }

  loop();
}

async function completeItem(itemId: string): Promise<void> {
  const item = await fetchItemById(itemId);
  if (!item) return;

  const seed = Array.from(item.query.keyword).reduce(
    (a, c) => a + c.charCodeAt(0),
    0
  );
  const base = 50000 + (seed * 137) % 250000;
  const median = Math.round(base / 1000) * 1000;
  const min = Math.round(median * 0.6);
  const max = Math.round(median * 1.8);
  const count = 25 + (seed % 100);

  // mikomiku_prompt を app_config から取得して Claude Haiku で見込金額を算出
  let suggestedBuyPrice = Math.round(median * 0.7);
  try {
    const supabase = createClient();
    const { data: configData } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "mikomiku_prompt")
      .maybeSingle();
    const prompt = configData?.value?.trim() || undefined;

    const res = await fetch("/api/estimate/mikomiku", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ median, min, max, count, prompt }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = await res.json();
      if (typeof json.mikomiku === "number" && json.mikomiku >= 0) {
        suggestedBuyPrice = json.mikomiku;
      }
    }
  } catch {
    // フォールバック: 中央値の70%（既に設定済み）
  }

  await updateListItem(itemId, {
    status: "completed",
    progress: 100,
    completedAt: new Date().toISOString(),
    result: { median, min, max, count, suggestedBuyPrice },
  });
  invalidateAll();

  toast({
    message: `「${item.query.keyword}」の検索が完了`,
    actionLabel: "リストを見る",
    actionHref: "/list",
  });
}

let processing = false;

export function processQueue(): void {
  if (processing) return;
  processing = true;
  (async () => {
    try {
      const lists = await fetchAllListsWithItems();
      const allItems = lists.flatMap((l) => l.items);
      const running = allItems.filter((i) => i.status === "running");

      // 走行中 → ticker 起動 (ページ再訪時のレジューム)
      for (const r of running) {
        if (!activeTickers.has(r.id)) tick(r.id);
      }

      const slots = MAX_PARALLEL - running.length;
      if (slots <= 0) return;

      const queued = allItems
        .filter((i) => i.status === "queued")
        .slice(0, slots);
      for (const item of queued) {
        await updateListItem(item.id, {
          status: "running",
          startedAt: new Date().toISOString(),
          progress: 0,
        });
        tick(item.id);
      }
      if (queued.length > 0) invalidateAll();
    } finally {
      processing = false;
    }
  })();
}
