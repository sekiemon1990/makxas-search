import { createServiceClient } from "@/lib/supabase/service";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

type SearchRow = {
  id: string;
  user_id: string;
  keyword: string;
  sources: string[];
  status: string;
  searched_at: string;
};

type ViewRow = {
  id: string;
  user_id: string;
  source: string;
  title: string;
  price: number;
  from_keyword: string | null;
  viewed_at: string;
};

type UserStat = {
  userId: string;
  email: string;
  searchCount30d: number;
  viewCount30d: number;
  errorCount30d: number;
  lastActive: string | null;
  topSources: string[];
  recentSearches: SearchRow[];
  recentViews: ViewRow[];
};

// ──────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  yahoo_auction: "ヤフオク",
  mercari: "メルカリ",
  jimoty: "ジモティー",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "完了",
  running: "実行中",
  queued: "待機中",
  error: "エラー",
  cancelled: "中止",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
  });
}

// ──────────────────────────────────────────────
// データ取得
// ──────────────────────────────────────────────

async function fetchData() {
  const service = createServiceClient();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: searches }, { data: views }, { data: { users } }] =
    await Promise.all([
      service
        .from("searches")
        .select("id, user_id, keyword, sources, status, searched_at")
        .gte("searched_at", since30d)
        .order("searched_at", { ascending: false })
        .limit(2000),
      service
        .from("listing_views")
        .select("id, user_id, source, title, price, from_keyword, viewed_at")
        .gte("viewed_at", since30d)
        .order("viewed_at", { ascending: false })
        .limit(5000),
      service.auth.admin.listUsers({ perPage: 1000 }),
    ]);

  return {
    searches: (searches ?? []) as SearchRow[],
    views: (views ?? []) as ViewRow[],
    users,
  };
}

// ──────────────────────────────────────────────
// ユーザー別集計
// ──────────────────────────────────────────────

function buildUserStats(
  searches: SearchRow[],
  views: ViewRow[],
  users: { id: string; email?: string }[],
): UserStat[] {
  // ユーザーID → 検索
  const searchesByUser: Record<string, SearchRow[]> = {};
  searches.forEach((s) => {
    if (!searchesByUser[s.user_id]) searchesByUser[s.user_id] = [];
    searchesByUser[s.user_id].push(s);
  });

  // ユーザーID → 閲覧
  const viewsByUser: Record<string, ViewRow[]> = {};
  views.forEach((v) => {
    if (!viewsByUser[v.user_id]) viewsByUser[v.user_id] = [];
    viewsByUser[v.user_id].push(v);
  });

  // 全ユーザーを取得（検索・閲覧どちらかあれば対象）
  const allUserIds = new Set([
    ...Object.keys(searchesByUser),
    ...Object.keys(viewsByUser),
  ]);

  const emailMap: Record<string, string> = {};
  users.forEach((u) => {
    emailMap[u.id] = u.email ?? u.id.slice(0, 8);
  });

  const stats: UserStat[] = [];

  for (const userId of allUserIds) {
    const userSearches = searchesByUser[userId] ?? [];
    const userViews = viewsByUser[userId] ?? [];

    // 閲覧媒体 TOP 3
    const srcCount: Record<string, number> = {};
    userViews.forEach((v) => {
      srcCount[v.source] = (srcCount[v.source] ?? 0) + 1;
    });
    const topSources = Object.entries(srcCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([src]) => SOURCE_LABEL[src] ?? src);

    // 最終アクティブ
    const times = [
      ...userSearches.map((s) => s.searched_at),
      ...userViews.map((v) => v.viewed_at),
    ].sort().reverse();
    const lastActive = times[0] ?? null;

    stats.push({
      userId,
      email: emailMap[userId] ?? userId,
      searchCount30d: userSearches.length,
      viewCount30d: userViews.length,
      errorCount30d: userSearches.filter((s) => s.status === "error").length,
      lastActive,
      topSources,
      recentSearches: userSearches.slice(0, 5),
      recentViews: userViews.slice(0, 5),
    });
  }

  // 最終アクティブ順にソート
  stats.sort((a, b) => {
    if (!a.lastActive) return 1;
    if (!b.lastActive) return -1;
    return a.lastActive > b.lastActive ? -1 : 1;
  });

  return stats;
}

// ──────────────────────────────────────────────
// ページ
// ──────────────────────────────────────────────

export default async function AdminUsersPage() {
  const { searches, views, users } = await fetchData();
  const userStats = buildUserStats(searches, views, users);

  const now = new Date().toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      {/* トップバー */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-8 h-14 shrink-0">
        <div>
          <h1 className="text-[16px] font-bold">ユーザー別行動詳細</h1>
          <p className="text-xs text-muted">直近 30 日の検索・閲覧アクティビティ</p>
        </div>
        <span className="text-xs text-muted">{now} 現在</span>
      </div>

      <div className="p-8 flex flex-col gap-6 max-w-[1200px]">

        {/* サマリー */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-surface border border-border rounded-xl px-6 py-5">
            <div className="text-xs text-muted mb-1.5">アクティブユーザー数</div>
            <div className="text-3xl font-bold text-foreground leading-none">
              {userStats.length}
            </div>
            <div className="text-xs text-muted mt-1.5">直近 30 日</div>
          </div>
          <div className="bg-surface border border-border rounded-xl px-6 py-5">
            <div className="text-xs text-muted mb-1.5">合計検索回数</div>
            <div className="text-3xl font-bold text-foreground leading-none">
              {searches.length.toLocaleString("ja-JP")}
            </div>
            <div className="text-xs text-muted mt-1.5">直近 30 日</div>
          </div>
          <div className="bg-surface border border-border rounded-xl px-6 py-5">
            <div className="text-xs text-muted mb-1.5">合計詳細ページ閲覧数</div>
            <div className="text-3xl font-bold text-foreground leading-none">
              {views.length.toLocaleString("ja-JP")}
            </div>
            <div className="text-xs text-muted mt-1.5">直近 30 日</div>
          </div>
        </div>

        {/* ユーザー別カード */}
        {userStats.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl px-8 py-12 text-center text-muted text-sm">
            データなし
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {userStats.map((stat) => (
              <div
                key={stat.userId}
                className="bg-surface border border-border rounded-xl overflow-hidden"
              >
                {/* ユーザーヘッダー */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[13px]">
                      {stat.email[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-foreground">
                        {stat.email.split("@")[0]}
                      </div>
                      <div className="text-xs text-muted">{stat.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-muted">検索</div>
                      <div className="text-[15px] font-bold text-foreground">
                        {stat.searchCount30d}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted">詳細閲覧</div>
                      <div className="text-[15px] font-bold text-foreground">
                        {stat.viewCount30d}
                      </div>
                    </div>
                    {stat.errorCount30d > 0 && (
                      <div className="text-right">
                        <div className="text-xs text-muted">エラー</div>
                        <div className="text-[15px] font-bold text-danger">
                          {stat.errorCount30d}
                        </div>
                      </div>
                    )}
                    <div className="text-right">
                      <div className="text-xs text-muted">最終アクティブ</div>
                      <div className="text-[13px] text-muted">
                        {stat.lastActive ? fmtDate(stat.lastActive) : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* タグ情報 */}
                <div className="px-6 py-3 border-b border-border bg-surface-2/50">
                  <div className="text-[10px] text-muted font-semibold uppercase tracking-wider mb-2">
                    よく閲覧する媒体
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {stat.topSources.length > 0 ? (
                      stat.topSources.map((src) => (
                        <span
                          key={src}
                          className="bg-info/8 text-info text-[11px] px-2 py-0.5 rounded"
                        >
                          {src}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted">なし</span>
                    )}
                  </div>
                </div>

                {/* 最近の検索 + 閲覧 */}
                <div className="grid grid-cols-2 divide-x divide-border">
                  {/* 最近の検索 */}
                  <div className="px-5 py-3">
                    <div className="text-[10px] text-muted font-semibold uppercase tracking-wider mb-2">
                      最近の検索（直近 5 件）
                    </div>
                    {stat.recentSearches.length === 0 ? (
                      <p className="text-xs text-muted">なし</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {stat.recentSearches.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 text-[12px]">
                            <span className="text-muted shrink-0 w-10">
                              {fmtDateShort(s.searched_at)}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                s.status === "completed"
                                  ? "bg-success/12 text-success"
                                  : s.status === "error"
                                    ? "bg-danger/12 text-danger"
                                    : "bg-muted/15 text-muted"
                              }`}
                            >
                              {STATUS_LABEL[s.status] ?? s.status}
                            </span>
                            <span className="text-foreground truncate">{s.keyword}</span>
                            <span className="text-muted text-[10px] shrink-0">
                              {s.sources.map((src) => SOURCE_LABEL[src] ?? src).join("/")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 最近の閲覧 */}
                  <div className="px-5 py-3">
                    <div className="text-[10px] text-muted font-semibold uppercase tracking-wider mb-2">
                      最近の詳細ページ閲覧（直近 5 件）
                    </div>
                    {stat.recentViews.length === 0 ? (
                      <p className="text-xs text-muted">なし</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {stat.recentViews.map((v) => (
                          <div key={v.id} className="flex items-center gap-2 text-[12px]">
                            <span className="text-muted shrink-0 w-10">
                              {fmtDateShort(v.viewed_at)}
                            </span>
                            <span className="text-info text-[10px] shrink-0 font-semibold">
                              {SOURCE_LABEL[v.source] ?? v.source}
                            </span>
                            <span className="text-foreground truncate">{v.title}</span>
                            <span className="text-muted text-[10px] shrink-0 font-semibold">
                              ¥{v.price.toLocaleString("ja-JP")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
