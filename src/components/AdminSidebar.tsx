"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Home,
  Lock,
  Settings,
  Target,
} from "lucide-react";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

type Props = {
  hasCostAccess: boolean;
  userEmail: string;
};

// ──────────────────────────────────────────────
// サブコンポーネント
// ──────────────────────────────────────────────

function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

function NavItem({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] mb-0.5 transition-colors ${
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted hover:bg-surface-2"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

// ──────────────────────────────────────────────
// AdminSidebar
// ──────────────────────────────────────────────

export function AdminSidebar({ hasCostAccess, userEmail }: Props) {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-56 bg-surface border-r border-border flex flex-col z-20">
      {/* ロゴ */}
      <div className="px-5 py-5 border-b border-border shrink-0">
        <div className="text-[15px] font-extrabold text-primary tracking-tight">
          makxas search
        </div>
        <div className="text-[10px] text-muted mt-0.5">管理コンソール</div>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <NavSection label="メイン">
          <NavItem
            href="/admin"
            active={pathname === "/admin"}
            icon={<LayoutDashboard size={15} />}
          >
            ダッシュボード
          </NavItem>
          <NavItem
            href="/admin/users"
            active={pathname === "/admin/users"}
            icon={<Users size={15} />}
          >
            ユーザー行動詳細
          </NavItem>
          <NavItem
            href="/admin/additional-buying"
            active={pathname === "/admin/additional-buying"}
            icon={<Target size={15} />}
          >
            追加買取トラッキング
          </NavItem>

          {/* コスト詳細：COST_VIEWER_EMAILS のユーザーのみ表示 */}
          {hasCostAccess && (
            <>
              <NavItem
                href="/admin/costs"
                active={pathname === "/admin/costs"}
                icon={<DollarSign size={15} />}
              >
                コスト詳細
              </NavItem>
              <p className="flex items-center gap-1 px-3 pb-2 text-[10px] text-muted">
                <Lock size={10} />
                オーナー権限のみ表示
              </p>
            </>
          )}
        </NavSection>

        <div className="mt-4 pt-3 border-t border-border">
          <NavItem
            href="/admin/settings"
            active={pathname === "/admin/settings"}
            icon={<Settings size={15} />}
          >
            管理設定
          </NavItem>
          <NavItem href="/search" active={false} icon={<Home size={15} />}>
            検索アプリへ戻る
          </NavItem>
        </div>
      </nav>

      {/* フッター（ログインユーザー情報） */}
      <div className="px-5 py-3 border-t border-border shrink-0">
        <div className="text-[12px] font-semibold text-foreground truncate">
          {userEmail.split("@")[0]}
        </div>
        <div className="text-[11px] text-muted truncate">{userEmail}</div>
        <span
          className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            hasCostAccess
              ? "bg-primary/10 text-primary"
              : "bg-muted/15 text-muted"
          }`}
        >
          {hasCostAccess ? "オーナー" : "スタッフ"}
        </span>
      </div>
    </aside>
  );
}
