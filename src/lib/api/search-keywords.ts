"use client";

import { createClient } from "@/lib/supabase/client";
import { ensureWritableClient } from "@/lib/auth/readonly-client";

export type SearchKeywordEntry = {
  keyword: string;
  count: number;
  lastUsedAt: string;
  isFavorite: boolean;
};

/**
 * 検索キーワードのカウンタ式蓄積。
 * 同じキーワードを検索すると count が増えるだけ。
 */
export async function recordSearchKeyword(keyword: string): Promise<void> {
  if (!(await ensureWritableClient())) return;
  const trimmed = keyword.trim();
  if (!trimmed) return;
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  // 既存行をチェック
  const { data: existing } = await supabase
    .from("search_keywords")
    .select("id, count")
    .eq("user_id", userData.user.id)
    .eq("keyword", trimmed)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("search_keywords")
      .update({
        count: existing.count + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("search_keywords").insert({
      user_id: userData.user.id,
      keyword: trimmed,
      count: 1,
    });
  }
}

/**
 * 個人検索履歴のうち、prefix にマッチするものを返す (count 降順)。
 * prefix が空の場合は最近頻出のものを返す。
 */
export async function fetchUserKeywordSuggestions(
  prefix: string,
  limit = 8,
): Promise<string[]> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const trimmed = prefix.trim();
  let query = supabase
    .from("search_keywords")
    .select("keyword, count, last_used_at")
    .eq("user_id", userData.user.id);

  if (trimmed) {
    // 前方一致 (大文字小文字無視) で絞り込み
    query = query.ilike("keyword", `${trimmed}%`);
  }

  const { data } = await query
    .order("count", { ascending: false })
    .order("last_used_at", { ascending: false })
    .limit(limit);

  if (!data) return [];
  return (data as { keyword: string }[]).map((r) => r.keyword);
}

/**
 * 検索履歴の全件取得 (履歴ページ用)。
 * 保存検索 (is_favorite=true) を最上位、その後 last_used_at 降順。
 */
export async function fetchSearchHistory(
  limit = 200,
): Promise<SearchKeywordEntry[]> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data } = await supabase
    .from("search_keywords")
    .select("keyword, count, last_used_at, is_favorite")
    .eq("user_id", userData.user.id)
    .order("is_favorite", { ascending: false })
    .order("last_used_at", { ascending: false })
    .limit(limit);

  if (!data) return [];
  return (
    data as {
      keyword: string;
      count: number;
      last_used_at: string;
      is_favorite: boolean | null;
    }[]
  ).map((r) => ({
    keyword: r.keyword,
    count: r.count,
    lastUsedAt: r.last_used_at,
    isFavorite: !!r.is_favorite,
  }));
}

/**
 * キーワードを保存検索 (お気に入り) に登録/解除。
 * 履歴に存在しなければ新規作成 (is_favorite=true)。
 */
export async function toggleFavoriteKeyword(
  keyword: string,
  isFavorite: boolean,
): Promise<void> {
  if (!(await ensureWritableClient())) return;
  const trimmed = keyword.trim();
  if (!trimmed) return;
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const { data: existing } = await supabase
    .from("search_keywords")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("keyword", trimmed)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("search_keywords")
      .update({ is_favorite: isFavorite })
      .eq("id", existing.id);
  } else if (isFavorite) {
    // 未検索のキーワードを直接保存検索として追加
    await supabase.from("search_keywords").insert({
      user_id: userData.user.id,
      keyword: trimmed,
      count: 0,
      is_favorite: true,
    });
  }
}

/**
 * 検索履歴の単一エントリを削除。
 */
export async function deleteSearchHistoryEntry(keyword: string): Promise<void> {
  if (!(await ensureWritableClient())) return;
  const trimmed = keyword.trim();
  if (!trimmed) return;
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  await supabase
    .from("search_keywords")
    .delete()
    .eq("user_id", userData.user.id)
    .eq("keyword", trimmed);
}
