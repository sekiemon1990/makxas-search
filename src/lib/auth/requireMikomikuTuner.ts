/**
 * 見込金額チューニング権限ゲート。
 *
 * 営業部/FS マネージャー・直営事業責任者だけが見込金額ロジックを
 * AIチャットで変更できるようにする。makxas-search にはロール階層が無いため、
 * 既存の COST_VIEWER_EMAILS と同じ「メール許可リスト」方式で制御する。
 *
 * 許可判定: ログイン済み かつ メールが MIKOMIKU_TUNING_EMAILS または
 * ADMIN_EMAILS に含まれる。どちらも未設定なら誰も許可しない（安全側）。
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isAllowedTuner } from "./email-allowlist";

export type RequireTunerResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; response: Response };

export async function requireMikomikuTuner(): Promise<RequireTunerResult> {
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

  const adminEmails = (() => {
    try {
      return serverEnv.ADMIN_EMAILS;
    } catch {
      return "";
    }
  })();

  if (!isAllowedTuner(user.email, serverEnv.MIKOMIKU_TUNING_EMAILS, adminEmails)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "forbidden",
          message:
            "見込金額ロジックの変更権限がありません。管理者にメールアドレスの追加を依頼してください。",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, userId: user.id, email: user.email ?? "" };
}
