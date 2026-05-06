"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

/** エラーをアーカイブ（対処済みにする） */
export async function archiveError(searchId: string) {
  const service = createServiceClient();
  await service
    .from("searches")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", searchId);
  revalidatePath("/admin");
}

/** アーカイブを解除（未対処に戻す） */
export async function unarchiveError(searchId: string) {
  const service = createServiceClient();
  await service
    .from("searches")
    .update({ archived_at: null })
    .eq("id", searchId);
  revalidatePath("/admin");
}
