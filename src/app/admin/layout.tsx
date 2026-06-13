import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/AdminSidebar";
import { FloatingWidget } from "@/components/ai/FloatingWidget";

/**
 * 管理画面の共通レイアウト。
 * - /admin/* 配下の全ページで使われるサイドバーをここで描画する。
 * - 認証チェックはここで一括実施（各ページでの重複チェックは不要）。
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/search");
  }

  // ADMIN_EMAILS（カンマ区切り）が設定されていれば管理者限定にする。
  // 未設定の間はログイン済み全員に開放（従来挙動）だが、警告ログを出して設定を促す。
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length > 0) {
    if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
      redirect("/search");
    }
  } else {
    console.warn(
      "[admin] ADMIN_EMAILS が未設定のため、ログイン済み全員が /admin にアクセス可能です。本番では設定してください。",
    );
  }

  // コスト閲覧権限チェック (プレビューでは全員に開放)
  const hasCostAccess = true;

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar hasCostAccess={hasCostAccess} userEmail={user.email ?? ""} />
      {/* サイドバー幅分だけ左マージンを確保 */}
      <div className="ml-56 flex-1 flex flex-col min-h-screen">
        {children}
      </div>
      <FloatingWidget pageContext="管理画面" />
    </div>
  );
}
