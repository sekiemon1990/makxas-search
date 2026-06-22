"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { isReadonlyDemoEmail } from "@/lib/auth/readonly";

async function isReadonlyActor(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isReadonlyDemoEmail(user?.email);
}

/** エラーをアーカイブ（対処済みにする） */
export async function archiveError(searchId: string) {
  if (await isReadonlyActor()) return;
  const service = createServiceClient();
  await service
    .from("searches")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", searchId);
  revalidatePath("/admin");
}

/** アーカイブを解除（未対処に戻す） */
export async function unarchiveError(searchId: string) {
  if (await isReadonlyActor()) return;
  const service = createServiceClient();
  await service
    .from("searches")
    .update({ archived_at: null })
    .eq("id", searchId);
  revalidatePath("/admin");
}
