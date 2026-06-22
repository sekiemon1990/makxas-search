"use client";

import { createClient } from "@/lib/supabase/client";
import type { SourceKey } from "@/lib/types";
import { ensureWritableClient } from "@/lib/auth/readonly-client";

export type ListingViewSnapshot = {
  ref: string;
  source: SourceKey;
  title: string;
  price: number;
  thumbnail?: string;
  endedAt: string;
  condition?: string;
  fromKeyword?: string;
  viewedAt: string;
  /** 起点となった検索のID */
  searchId?: string;
  /** 検索結果一覧での表示順位（1始まり） */
  resultRank?: number;
  /** どこから遷移してきたか */
  fromPage?: "search_result" | "history" | "pin" | "share" | "direct" | "list";
};

export async function recordListingView(
  snapshot: Omit<ListingViewSnapshot, "viewedAt">
): Promise<void> {
  if (!(await ensureWritableClient())) return;
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) console.error("[views] auth error:", userError);
  if (!userData.user) {
    console.error("[views] No authenticated user");
    return;
  }

  // 既存の同じ ref を削除して新しく記録
  const { error: deleteError } = await supabase
    .from("listing_views")
    .delete()
    .eq("user_id", userData.user.id)
    .eq("listing_ref", snapshot.ref);
  if (deleteError) console.error("[views] delete error:", deleteError);

  const { error: insertError } = await supabase.from("listing_views").insert({
    user_id: userData.user.id,
    listing_ref: snapshot.ref,
    source: snapshot.source,
    title: snapshot.title,
    price: snapshot.price,
    thumbnail: snapshot.thumbnail ?? null,
    ended_at: snapshot.endedAt,
    condition: snapshot.condition ?? null,
    from_keyword: snapshot.fromKeyword ?? null,
    search_id: snapshot.searchId ?? null,
    result_rank: snapshot.resultRank ?? null,
    from_page: snapshot.fromPage ?? "direct",
  });
  if (insertError) console.error("[views] insert error:", insertError);
}

export async function fetchListingViews(): Promise<ListingViewSnapshot[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("listing_views")
    .select("*")
    .order("viewed_at", { ascending: false })
    .limit(100);
  if (error) console.error("[views] fetch error:", error);
  return (data ?? []).map((row) => ({
    ref: row.listing_ref,
    source: row.source as SourceKey,
    title: row.title,
    price: row.price,
    thumbnail: row.thumbnail ?? undefined,
    endedAt: row.ended_at,
    condition: row.condition ?? undefined,
    fromKeyword: row.from_keyword ?? undefined,
    viewedAt: row.viewed_at,
    searchId: row.search_id ?? undefined,
    resultRank: row.result_rank ?? undefined,
    fromPage: row.from_page ?? undefined,
  }));
}
