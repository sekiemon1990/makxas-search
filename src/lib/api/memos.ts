"use client";

import { createClient } from "@/lib/supabase/client";
import { ensureWritableClient } from "@/lib/auth/readonly-client";

export type MemoRow = {
  id: string;
  user_id: string;
  search_keyword: string | null;
  listing_ref: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export async function fetchSearchMemo(searchKeyword: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("memos")
    .select("body")
    .eq("search_keyword", searchKeyword)
    .is("listing_ref", null)
    .maybeSingle();
  if (error) console.error("[memos] fetchSearchMemo error:", error);
  return data?.body ?? "";
}

export async function fetchListingMemo(listingRef: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("memos")
    .select("body")
    .eq("listing_ref", listingRef)
    .is("search_keyword", null)
    .maybeSingle();
  if (error) console.error("[memos] fetchListingMemo error:", error);
  return data?.body ?? "";
}

export async function upsertSearchMemo(
  searchKeyword: string,
  body: string
): Promise<void> {
  if (!(await ensureWritableClient())) return;
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) console.error("[memos] auth error:", userError);
  if (!userData.user) {
    console.error("[memos] No authenticated user");
    return;
  }

  const trimmed = body.trim();
  if (!trimmed) {
    const { error } = await supabase
      .from("memos")
      .delete()
      .eq("user_id", userData.user.id)
      .eq("search_keyword", searchKeyword)
      .is("listing_ref", null);
    if (error) console.error("[memos] delete search memo error:", error);
    return;
  }

  const { data: existing, error: selectError } = await supabase
    .from("memos")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("search_keyword", searchKeyword)
    .is("listing_ref", null)
    .maybeSingle();
  if (selectError) console.error("[memos] select error:", selectError);

  if (existing) {
    const { error } = await supabase
      .from("memos")
      .update({ body: trimmed, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) console.error("[memos] update search memo error:", error);
  } else {
    const { error } = await supabase.from("memos").insert({
      user_id: userData.user.id,
      search_keyword: searchKeyword,
      listing_ref: null,
      body: trimmed,
    });
    if (error) console.error("[memos] insert search memo error:", error);
  }
}

export async function upsertListingMemo(
  listingRef: string,
  body: string
): Promise<void> {
  if (!(await ensureWritableClient())) return;
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) console.error("[memos] auth error:", userError);
  if (!userData.user) {
    console.error("[memos] No authenticated user");
    return;
  }

  const trimmed = body.trim();
  if (!trimmed) {
    const { error } = await supabase
      .from("memos")
      .delete()
      .eq("user_id", userData.user.id)
      .eq("listing_ref", listingRef)
      .is("search_keyword", null);
    if (error) console.error("[memos] delete listing memo error:", error);
    return;
  }

  const { data: existing, error: selectError } = await supabase
    .from("memos")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("listing_ref", listingRef)
    .is("search_keyword", null)
    .maybeSingle();
  if (selectError) console.error("[memos] select error:", selectError);

  if (existing) {
    const { error } = await supabase
      .from("memos")
      .update({ body: trimmed, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) console.error("[memos] update listing memo error:", error);
  } else {
    const { error } = await supabase.from("memos").insert({
      user_id: userData.user.id,
      search_keyword: null,
      listing_ref: listingRef,
      body: trimmed,
    });
    if (error) console.error("[memos] insert listing memo error:", error);
  }
}

export async function fetchAllMemos(): Promise<{
  searchMemos: Map<string, string>;
  listingMemos: Map<string, string>;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.from("memos").select("*");
  if (error) console.error("[memos] fetchAll error:", error);
  const searchMemos = new Map<string, string>();
  const listingMemos = new Map<string, string>();
  for (const row of (data ?? []) as MemoRow[]) {
    if (row.search_keyword) searchMemos.set(row.search_keyword, row.body);
    if (row.listing_ref) listingMemos.set(row.listing_ref, row.body);
  }
  return { searchMemos, listingMemos };
}
