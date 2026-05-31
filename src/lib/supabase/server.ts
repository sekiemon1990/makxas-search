import { createMakxasServerClient } from "@makxas/supabase-next";

export async function createClient() {
  return createMakxasServerClient();
}
