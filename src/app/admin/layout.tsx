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

  // プレビュー用: ログイン済みなら誰でもアクセス可 (本番では ADMIN_EMAILS チェックに戻す)
  if (!user) {
    redirect("/search");
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
