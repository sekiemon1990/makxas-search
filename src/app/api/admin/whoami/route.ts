import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** デバッグ用: ログイン中のメールと ADMIN_EMAILS 設定を返す (確認後削除予定) */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  return NextResponse.json({
    userEmail: user?.email ?? null,
    adminEmails,
    isAdmin: adminEmails.includes(user?.email ?? ""),
  });
}
