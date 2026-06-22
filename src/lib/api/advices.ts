"use client";

import { createClient } from "@/lib/supabase/client";
import { ensureWritableClient } from "@/lib/auth/readonly-client";

export type SavedAdvice = {
  searchKey: string;
  keyword: string;
  productGuess?: string;
  summary: string;
  recommendations: { rank: string; price: number; rate: number }[];
  warnings: string[];
  savedAt: string;
};

export async function fetchSavedAdvices(): Promise<SavedAdvice[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("saved_advices")
    .select("*")
    .order("saved_at", { ascending: false });
  return (data ?? []).map((row) => ({
    searchKey: row.search_keyword,
    keyword: row.search_keyword,
    productGuess: row.product_guess ?? undefined,
    summary: row.summary,
    recommendations: row.recommendations,
    warnings: row.warnings,
    savedAt: row.saved_at,
  }));
}

export async function isAdviceSaved(searchKey: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("saved_advices")
    .select("id")
    .eq("search_keyword", searchKey)
    .maybeSingle();
  return !!data;
}

export async function saveAdvice(
  advice: Omit<SavedAdvice, "savedAt">
): Promise<void> {
  if (!(await ensureWritableClient())) return;
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  await supabase.from("saved_advices").upsert(
    {
      user_id: userData.user.id,
      search_keyword: advice.searchKey,
      product_guess: advice.productGuess ?? null,
      summary: advice.summary,
      recommendations: advice.recommendations,
      warnings: advice.warnings,
      saved_at: new Date().toISOString(),
    },
    { onConflict: "user_id,search_keyword" }
  );
}

export async function removeSavedAdvice(searchKey: string): Promise<void> {
  if (!(await ensureWritableClient())) return;
  const supabase = createClient();
  await supabase
    .from("saved_advices")
    .delete()
    .eq("search_keyword", searchKey);
}
