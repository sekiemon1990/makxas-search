import { createClient } from "@supabase/supabase-js";

/**
 * Supabase service role クライアント。
 * RLS をバイパスして全データにアクセス可能。
 * サーバーサイド専用（クライアントコンポーネントには渡さないこと）。
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
