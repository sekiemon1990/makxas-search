import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/AdminSidebar";

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

  // 管理者チェック
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (!user || !adminEmails.includes(user.email ?? "")) {
    redirect("/search");
  }

  // コスト閲覧権限チェック
  const costViewerEmails = (process.env.COST_VIEWER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const hasCostAccess = costViewerEmails.includes(user.email ?? "");

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar hasCostAccess={hasCostAccess} userEmail={user.email ?? ""} />
      {/* サイドバー幅分だけ左マージンを確保 */}
      <div className="ml-56 flex-1 flex flex-col min-h-screen">
        {children}
      </div>
    </div>
  );
}
