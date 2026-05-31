/**
 * API ルート用の認可ゲート。
 *
 * makxas-search は staff role が無いシンプルな認証モデル:
 *   - ログイン済み (Supabase Auth) → 通過
 *   - 未ログイン → 401
 *
 * 共通基盤 (makxas-recording / makxas-front) では role hierarchy + CRON_SECRET も
 * 持つが、search では現状不要なので最小実装。将来 role が必要になったら拡張する。
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type RequireApiAuthResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: Response };

/**
 * リクエストが認証済みかチェックする。
 * - 認証済み → { ok: true, userId, email }
 * - 未認証 → { ok: false, response: 401 }
 *
 * 使い方:
 *   const gate = await requireApiAuth();
 *   if (!gate.ok) return gate.response;
 *   // 以降は gate.userId が使える
 */
export async function requireApiAuth(): Promise<RequireApiAuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized", message: "ログインが必要です" },
        { status: 401 },
      ),
    };
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
  };
}
