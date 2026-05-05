import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { ShareLoginBanner } from "@/components/share/ShareLoginBanner";
import { ShareSearchView } from "@/components/share/ShareSearchView";
import { ShareListView } from "@/components/share/ShareListView";
import { ShareListingView } from "@/components/share/ShareListingView";

// ============================================================================
// 型定義
// ============================================================================

type ShareTokenRow = {
  token: string;
  resource_type: "search" | "list" | "listing";
  resource_id: string;
  permission: "view" | "edit";
};

// ============================================================================
// ページ
// ============================================================================

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const service = createServiceClient();

  // 1. トークンを取得
  const { data: tokenRow, error: tokenError } = await service
    .from("share_tokens")
    .select("token, resource_type, resource_id, permission")
    .eq("token", token)
    .single();

  if (tokenError || !tokenRow) {
    notFound();
  }

  const share = tokenRow as ShareTokenRow;

  // 2. ログイン状態確認（なくてもコンテンツは見せる）
  let isLoggedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isLoggedIn = !!user;
  } catch {
    // ignore
  }

  const currentUrl = `/share/${token}`;

  // 3. リソース種別に応じてデータ取得
  let content: React.ReactNode = null;

  // ──────────────────────────────────────
  // 検索結果共有（searches テーブルから基本情報のみ）
  // ──────────────────────────────────────
  if (share.resource_type === "search") {
    const { data: searchRow } = await service
      .from("searches")
      .select("id, keyword, sources, status, searched_at")
      .eq("id", share.resource_id)
      .single();

    if (!searchRow) notFound();

    content = (
      <ShareSearchView
        search={searchRow as Parameters<typeof ShareSearchView>[0]["search"]}
      />
    );
  }

  // ──────────────────────────────────────
  // 査定リスト共有
  // ──────────────────────────────────────
  else if (share.resource_type === "list") {
    const { data: listRow } = await service
      .from("appraisal_lists")
      .select("id, name")
      .eq("id", share.resource_id)
      .single();

    if (!listRow) notFound();

    const { data: itemRows } = await service
      .from("list_items")
      .select(
        "id, keyword, sources, status, median, min_price, max_price, suggested_buy_price, appraisal_status, added_at"
      )
      .eq("list_id", share.resource_id)
      .order("added_at", { ascending: false });

    content = (
      <ShareListView
        list={listRow as { id: string; name: string | null }}
        items={(itemRows ?? []) as Parameters<typeof ShareListView>[0]["items"]}
        token={token}
        permission={share.permission}
      />
    );
  }

  // ──────────────────────────────────────
  // 商品詳細共有（listing_views スナップショット）
  // resource_id = listing_ref (例: yahoo_auction-ITEM_ID)
  // ──────────────────────────────────────
  else if (share.resource_type === "listing") {
    const { data: viewRow } = await service
      .from("listing_views")
      .select(
        "listing_ref, source, title, price, thumbnail, ended_at, condition, from_keyword"
      )
      .eq("listing_ref", share.resource_id)
      .order("viewed_at", { ascending: false })
      .limit(1)
      .single();

    if (!viewRow) notFound();

    content = (
      <ShareListingView
        listing={viewRow as Parameters<typeof ShareListingView>[0]["listing"]}
      />
    );
  } else {
    notFound();
  }

  // 4. レンダリング
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ログインしていない場合はバナーを表示 */}
      {!isLoggedIn && <ShareLoginBanner shareUrl={currentUrl} />}

      {/* ログイン済みの場合はシンプルなトップバー */}
      {isLoggedIn && (
        <div className="sticky top-0 z-10 border-b border-border bg-surface px-6 h-12 flex items-center">
          <span className="text-sm font-bold text-foreground">
            マクサスサーチ
          </span>
          <span className="mx-2 text-muted">›</span>
          <span className="text-sm text-muted">共有コンテンツ</span>
        </div>
      )}

      {/* コンテンツ */}
      <main className="flex-1">{content}</main>
    </div>
  );
}
