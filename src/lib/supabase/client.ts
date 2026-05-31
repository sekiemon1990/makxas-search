"use client";

import { createMakxasBrowserClient } from "@makxas/supabase-next";

export function createClient() {
  return createMakxasBrowserClient();
}
