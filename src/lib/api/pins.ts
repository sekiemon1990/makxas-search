"use client";

import { createClient } from "@/lib/supabase/client";
import { ensureWritableClient } from "@/lib/auth/readonly-client";

export type PinRow = {
  id: string;
  user_id: string;
  search_keyword: string | null;
  listing_ref: string | null;
  pinned_at: string;
};

export async function fetchSearchPin(searchKeyword: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pins")
    .select("id")
    .eq("search_keyword", searchKeyword)
    .is("listing_ref", null)
    .maybeSingle();
  if (error) console.error("[pins] fetchSearchPin error:", error);
  return !!data;
}

export async function fetchListingPin(listingRef: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pins")
    .select("id")
    .eq("listing_ref", listingRef)
    .is("search_keyword", null)
    .maybeSingle();
  if (error) console.error("[pins] fetchListingPin error:", error);
  return !!data;
}

export async function setSearchPin(
  searchKeyword: string,
  pinned: boolean
): Promise<void> {
  if (!(await ensureWritableClient())) return;
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) console.error("[pins] auth error:", userError);
  if (!userData.user) {
    console.error("[pins] No authenticated user");
    return;
  }

  if (pinned) {
    const { data: existing } = await supabase
      .from("pins")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("search_keyword", searchKeyword)
      .is("listing_ref", null)
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("pins").insert({
        user_id: userData.user.id,
        search_keyword: searchKeyword,
        listing_ref: null,
      });
      if (error) console.error("[pins] insert search pin error:", error);
    }
  } else {
    const { error } = await supabase
      .from("pins")
      .delete()
      .eq("user_id", userData.user.id)
      .eq("search_keyword", searchKeyword)
      .is("listing_ref", null);
    if (error) console.error("[pins] delete search pin error:", error);
  }
}

export async function setListingPin(
  listingRef: string,
  pinned: boolean
): Promise<void> {
  if (!(await ensureWritableClient())) return;
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) console.error("[pins] auth error:", userError);
  if (!userData.user) {
    console.error("[pins] No authenticated user");
    return;
  }

  if (pinned) {
    const { data: existing } = await supabase
      .from("pins")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("listing_ref", listingRef)
      .is("search_keyword", null)
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("pins").insert({
        user_id: userData.user.id,
        search_keyword: null,
        listing_ref: listingRef,
      });
      if (error) console.error("[pins] insert listing pin error:", error);
    }
  } else {
    const { error } = await supabase
      .from("pins")
      .delete()
      .eq("user_id", userData.user.id)
      .eq("listing_ref", listingRef)
      .is("search_keyword", null);
    if (error) console.error("[pins] delete listing pin error:", error);
  }
}

export async function fetchAllPins(): Promise<{
  searchPins: Set<string>;
  listingPins: Set<string>;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.from("pins").select("*");
  if (error) console.error("[pins] fetchAll error:", error);
  const searchPins = new Set<string>();
  const listingPins = new Set<string>();
  for (const row of (data ?? []) as PinRow[]) {
    if (row.search_keyword) searchPins.add(row.search_keyword);
    if (row.listing_ref) listingPins.add(row.listing_ref);
  }
  return { searchPins, listingPins };
}
