import { createServiceClient } from "@/lib/supabase/service";
import { CopyPromptButton } from "@/components/CopyPromptButton";
import { ArchiveButton, UnarchiveButton } from "./ErrorArchiveButton";

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
  total_count: number | null;
  median: number | null;
  archived_at: string | null;
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

// ──────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  yahoo_auction: "ヤフオク",
  mercari: "メルカリ",
  jimoty: "ジモティー",
};

const SOURCE_SCRAPER: Record<string, string[]> = {
  yahoo_auction: [
    "src/app/api/scrape/yahoo/route.ts",
    "src/lib/scrapers/yahoo.ts",
  ],
  mercari: [
    "src/app/api/scrape/mercari/route.ts",
    "src/lib/scrapers/mercari.ts",
  ],
  jimoty: [
    "src/app/api/scrape/jimoty/route.ts",
    "src/lib/scrapers/jimoty.ts",
  ],
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

/** エンジニア向け修正依頼プロンプト */
function buildFixPrompt(s: SearchRow, userEmail: string): string {
  const sourceNames = s.sources.map((src) => SOURCE_LABEL[src] ?? src).join("、");
  const scraperFiles = s.sources
    .flatMap((src) => SOURCE_SCRAPER[src] ?? [])
    .filter((v, i, a) => a.indexOf(v) === i);
  const fileList = scraperFiles.map((f) => `- ${f}`).join("\n");

  return `以下の検索でエラーが発生しています。原因を調査して修正してください。

## エラー情報
- 発生日時: ${new Date(s.searched_at).toLocaleString("ja-JP")}
- 担当ユーザー: ${userEmail}
- キーワード: ${s.keyword}
- 媒体: ${sourceNames}
- 検索ID: ${s.id}

## 調査対象ファイル
${fileList || "- src/lib/scrapers/ 配下"}

## 修正依頼
1. 上記スクレイパーでエラーが発生した原因を特定する（HTML構造の変化・レート制限・ネットワーク障害等）
2. 必要な修正を実施する
3. 同様エラーが再発しないよう、エラーハンドリングを改善する

参考: src/lib/logger.ts でエラーログを確認できます。`;
}

/** ユーザーへのヒアリング事項プロンプト */
function buildHearingPrompt(s: SearchRow, userEmail: string): string {
  const sourceNames = s.sources.map((src) => SOURCE_LABEL[src] ?? src).join("、");
  const isAnonymous = !userEmail || userEmail.includes("（不明）");
  const contactInfo = isAnonymous
    ? "※ ユーザーが特定できていません。ログから特定後に連絡してください。"
    : `連絡先: ${userEmail}`;

  return `【エラー発生ユーザーへのヒアリング】

${contactInfo}

## エラー概要（確認用）
- 発生日時: ${new Date(s.searched_at).toLocaleString("ja-JP")}
- 検索キーワード: ${s.keyword}
- 選択した媒体: ${sourceNames}

## ヒアリング事項

お手数ですが、以下の内容をご確認いただけますか？

1. エラーが発生した時の状況を詳しく教えてください
   （例: 「検索ボタンを押したら画面が止まった」「エラーメッセージが出た」など）

2. 画面にエラーメッセージは表示されましたか？表示された場合、何と書いてありましたか？
   （スクリーンショットがあれば共有いただけると助かります）

3. 検索結果は一部でも表示されましたか？それとも全く表示されませんでしたか？

4. 同じキーワード・同じ媒体で再度試しましたか？その結果はどうでしたか？

5. このようなエラーは今回が初めてですか？以前にも経験したことがありますか？
   （ある場合：いつ頃から発生しているか教えてください）

6. エラーが起きる直前に何か特別な操作はありましたか？
   （例: 初めて選んだ媒体、今まで使ったことのない検索条件、など）

ご協力をよろしくお願いします。`;
}

// ──────────────────────────────────────────────
// データ取得
// ──────────────────────────────────────────────

async function fetchDashboardData() {
  const service = createServiceClient();

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 検索ログ
  const { data: searches } = await service
    .from("searches")
    .select("id, user_id, keyword, sources, status, searched_at, total_count, median, archived_at")
    .gte("searched_at", since30d)
    .order("searched_at", { ascending: false })
    .limit(500);

  // 詳細ページ閲覧ログ
  const { data: views } = await service
    .from("listing_views")
    .select("id, user_id, source, title, price, from_keyword, viewed_at")
    .gte("viewed_at", since30d)
    .order("viewed_at", { ascending: false })
    .limit(1000);

  // 査定ステータス集計
  const { data: appraisalStats } = await service
    .from("list_items")
    .select("appraisal_status")
    .order("created_at", { ascending: false })
    .limit(1000);

  // 直近7日のスクレイピング状態
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentSearches } = await service
    .from("searches")
    .select("sources, status, total_count, searched_at")
    .gte("searched_at", since7d)
    .order("searched_at", { ascending: false })
    .limit(500);

  // ユーザーメールマップ
  const {
    data: { users },
  } = await service.auth.admin.listUsers({ perPage: 1000 });
  const userEmailMap: Record<string, string> = {};
  users.forEach((u) => {
    userEmailMap[u.id] = u.email ?? u.id.slice(0, 8);
  });

  // 査定ステータス集計
  const statusCounts = {
    pending: appraisalStats?.filter(r => r.appraisal_status === 'pending').length ?? 0,
    accepted: appraisalStats?.filter(r => r.appraisal_status === 'accepted').length ?? 0,
    rejected: appraisalStats?.filter(r => r.appraisal_status === 'rejected').length ?? 0,
  };

  // スクレイピング状態（直近7日）
  const sourceKeys = ["yahoo_auction", "mercari", "jimoty"] as const;
  const sourceLabels: Record<string, string> = {
    yahoo_auction: "ヤフオク",
    mercari: "メルカリ",
    jimoty: "ジモティー",
  };
  const scrapeHealth = sourceKeys.map(key => {
    const related = recentSearches?.filter(s => s.sources?.includes(key)) ?? [];
    const total = related.length;
    const errors = related.filter(s => s.status === 'error').length;
    const successRate = total === 0 ? null : Math.round(((total - errors) / total) * 100);
    return { key, label: sourceLabels[key], total, errors, successRate };
  });

  return {
    searches: (searches ?? []) as SearchRow[],
    views: (views ?? []) as ViewRow[],
    userEmailMap,
    statusCounts,
    scrapeHealth,
  };
}

// ──────────────────────────────────────────────
// 集計
// ──────────────────────────────────────────────

function aggregate(searches: SearchRow[], views: ViewRow[]) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStr = new Date().toISOString().slice(0, 7);

  const todaySearches = searches.filter((s) => s.searched_at.startsWith(today));
  const monthSearches = searches.filter((s) => s.searched_at.startsWith(monthStr));

  // 検索集計
  const todayTotal = todaySearches.length;
  const todayErrors = todaySearches.filter((s) => s.status === "error").length;
  const todayErrorRate =
    todayTotal > 0 ? ((todayErrors / todayTotal) * 100).toFixed(1) : "0.0";
  const monthTotal = monthSearches.length;
  const activeUsers = new Set(monthSearches.map((s) => s.user_id)).size;

  const userCounts: Record<string, number> = {};
  todaySearches.forEach((s) => {
    userCounts[s.user_id] = (userCounts[s.user_id] ?? 0) + 1;
  });
  const topEntry = Object.entries(userCounts).sort(([, a], [, b]) => b - a)[0];

  // 直近14日の日次件数（検索）
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const dailyCounts: Record<string, number> = {};
  searches.forEach((s) => {
    const day = s.searched_at.slice(0, 10);
    dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
  });
  const maxDailyCount = Math.max(...last14Days.map((d) => dailyCounts[d] ?? 0), 1);

  // 媒体別（今月）
  const sourceCounts: Record<string, number> = {};
  monthSearches.forEach((s) => {
    s.sources.forEach((src) => {
      sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
    });
  });
  const totalSources = Object.values(sourceCounts).reduce((a, b) => a + b, 0);

  // ── 詳細ページ閲覧集計 ──
  const todayViews = views.filter((v) => v.viewed_at.startsWith(today));
  const monthViews = views.filter((v) => v.viewed_at.startsWith(monthStr));

  const viewSourceCounts: Record<string, number> = {};
  monthViews.forEach((v) => {
    viewSourceCounts[v.source] = (viewSourceCounts[v.source] ?? 0) + 1;
  });
  const totalViewSources = Object.values(viewSourceCounts).reduce((a, b) => a + b, 0);

  // 直近14日の日次閲覧件数
  const dailyViewCounts: Record<string, number> = {};
  views.forEach((v) => {
    const day = v.viewed_at.slice(0, 10);
    dailyViewCounts[day] = (dailyViewCounts[day] ?? 0) + 1;
  });
  const maxDailyViewCount = Math.max(
    ...last14Days.map((d) => dailyViewCounts[d] ?? 0),
    1,
  );

  // ── ① スクレイパー稼働状況（直近 7 日）──
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent7dSearches = searches.filter((s) => s.searched_at >= since7d);
  const TRACKED_SOURCES = ["yahoo_auction", "mercari", "jimoty"] as const;
  const scraperStats = TRACKED_SOURCES.map((src) => {
    const relevant = recent7dSearches.filter(
      (s) => s.sources.includes(src) && (s.status === "completed" || s.status === "error"),
    );
    const errors = relevant.filter((s) => s.status === "error").length;
    const total = relevant.length;
    const errorRate = total > 0 ? (errors / total) * 100 : 0;
    const level =
      errorRate === 0 ? "ok" : errorRate < 5 ? "ok" : errorRate < 15 ? "warn" : "error";
    return { src, total, errors, errorRate, level };
  });

  // ── ④ 検索→閲覧の転換率（今月）──
  const monthCompleted = monthSearches.filter((s) => s.status === "completed");
  const conversionRate =
    monthCompleted.length > 0
      ? ((monthViews.length / monthCompleted.length) * 100).toFixed(0)
      : "0";
  // ユーザー単位: 検索したユーザーのうち閲覧もしたユーザーの割合
  const searchUserIds = new Set(monthSearches.map((s) => s.user_id));
  const viewUserIds = new Set(monthViews.map((v) => v.user_id));
  const convertedUsers = [...searchUserIds].filter((id) => viewUserIds.has(id)).length;
  const userConversionRate =
    searchUserIds.size > 0
      ? Math.round((convertedUsers / searchUserIds.size) * 100)
      : 0;

  // ── ⑤ 空振り検索（今月）──
  const zeroResultSearches = searches.filter(
    (s) => s.status === "completed" && s.total_count === 0,
  );
  const monthZeroResults = zeroResultSearches.filter((s) =>
    s.searched_at.startsWith(monthStr),
  );
  const zeroResultRate =
    monthCompleted.length > 0
      ? ((monthZeroResults.length / monthCompleted.length) * 100).toFixed(1)
      : "0.0";
  // 空振り多い媒体
  const zeroSourceCounts: Record<string, number> = {};
  monthZeroResults.forEach((s) => {
    s.sources.forEach((src) => {
      zeroSourceCounts[src] = (zeroSourceCounts[src] ?? 0) + 1;
    });
  });

  return {
    todayTotal,
    todayErrorRate,
    todayErrors,
    monthTotal,
    activeUsers,
    topEntry,
    last14Days,
    dailyCounts,
    maxDailyCount,
    sourceCounts,
    totalSources,
    // views
    todayViewCount: todayViews.length,
    monthViewCount: monthViews.length,
    viewSourceCounts,
    totalViewSources,
    dailyViewCounts,
    maxDailyViewCount,
    // ① スクレイパー稼働状況
    scraperStats,
    // ④ 転換率
    conversionRate,
    userConversionRate,
    // ⑤ 空振り
    zeroResultCount: monthZeroResults.length,
    zeroResultRate,
    zeroSourceCounts,
  };
}

// ──────────────────────────────────────────────
// ページ
// ──────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const { searches, views, userEmailMap, statusCounts, scrapeHealth } = await fetchDashboardData();
  const agg = aggregate(searches, views);
  const recent200 = searches.slice(0, 200);

  // エラー一覧（未アーカイブ・直近30件）
  const recentErrors = searches
    .filter((s) => s.status === "error" && !s.archived_at)
    .slice(0, 30);
  // アーカイブ済みエラー
  const archivedErrors = searches
    .filter((s) => s.status === "error" && !!s.archived_at)
    .slice(0, 50);

  // 空振り一覧（直近20件）
  const recentZeroResults = searches
    .filter((s) => s.status === "completed" && s.total_count === 0)
    .slice(0, 20);

  // 最近の閲覧ログ（直近100件）
  const recentViews = views.slice(0, 100);

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
        <h1 className="text-[16px] font-bold">ダッシュボード</h1>
        <span className="text-xs text-muted">{now} 現在</span>
      </div>

      <div className="p-8 flex flex-col gap-6 max-w-[1200px]">

        {/* ── 検索サマリーカード ── */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
            検索アクティビティ
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[
              {
                label: "今日の検索回数",
                value: agg.todayTotal.toLocaleString("ja-JP"),
                sub: `アクティブユーザー ${new Set(searches.filter((s) => s.searched_at.startsWith(new Date().toISOString().slice(0, 10))).map((s) => s.user_id)).size}名`,
              },
              {
                label: "今月の検索回数",
                value: agg.monthTotal.toLocaleString("ja-JP"),
                sub: `ユーザー ${agg.activeUsers}名`,
              },
              {
                label: "今日のエラー率",
                value: `${agg.todayErrorRate}%`,
                sub:
                  agg.todayTotal > 0
                    ? `${Math.round((Number(agg.todayErrorRate) * agg.todayTotal) / 100)}件 / ${agg.todayTotal}件`
                    : "検索なし",
                warn: Number(agg.todayErrorRate) >= 10,
              },
              {
                label: "今日の最多利用",
                value: agg.topEntry
                  ? (userEmailMap[agg.topEntry[0]] ?? agg.topEntry[0]).split("@")[0]
                  : "—",
                sub: agg.topEntry ? `${agg.topEntry[1]} 件` : "",
                small: true,
              },
            ].map(({ label, value, sub, warn, small }) => (
              <div
                key={label}
                className="bg-surface border border-border rounded-xl px-6 py-5"
              >
                <div className="text-xs text-muted mb-1.5">{label}</div>
                <div
                  className={`font-bold leading-none ${small ? "text-xl mt-1" : "text-3xl"} ${warn ? "text-danger" : "text-foreground"}`}
                >
                  {value}
                </div>
                {sub && <div className="text-xs text-muted mt-1.5">{sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── 詳細ページ閲覧サマリーカード ── */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
            詳細ページ閲覧（listing_views）
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-surface border border-border rounded-xl px-6 py-5">
              <div className="text-xs text-muted mb-1.5">今日の閲覧数</div>
              <div className="text-3xl font-bold text-foreground leading-none">
                {agg.todayViewCount.toLocaleString("ja-JP")}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl px-6 py-5">
              <div className="text-xs text-muted mb-1.5">今月の閲覧数</div>
              <div className="text-3xl font-bold text-foreground leading-none">
                {agg.monthViewCount.toLocaleString("ja-JP")}
              </div>
            </div>
            {Object.entries(agg.viewSourceCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 2)
              .map(([src, count]) => (
                <div key={src} className="bg-surface border border-border rounded-xl px-6 py-5">
                  <div className="text-xs text-muted mb-1.5">
                    {SOURCE_LABEL[src] ?? src}（今月）
                  </div>
                  <div className="text-3xl font-bold text-foreground leading-none">
                    {count.toLocaleString("ja-JP")}
                  </div>
                  <div className="text-xs text-muted mt-1.5">
                    {agg.totalViewSources > 0
                      ? Math.round((count / agg.totalViewSources) * 100)
                      : 0}
                    %
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* ── チャート行 ── */}
        <div className="grid grid-cols-2 gap-5">
          {/* 日次検索件数 */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-4">
              日次検索回数（直近 14 日）
            </div>
            <div className="flex items-end gap-1.5 h-24">
              {agg.last14Days.map((day) => {
                const count = agg.dailyCounts[day] ?? 0;
                const pxH = Math.max(Math.round((count / agg.maxDailyCount) * 96), 2);
                return (
                  <div
                    key={day}
                    className="flex flex-col items-center justify-end flex-1 h-full"
                  >
                    <div
                      className="w-full bg-primary/60 rounded-t-sm"
                      style={{ height: `${pxH}px` }}
                      title={`${day}: ${count}件`}
                    />
                    <span className="text-[9px] text-muted mt-1.5 whitespace-nowrap">
                      {day.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 日次閲覧件数 */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-4">
              詳細ページ閲覧（直近 14 日）
            </div>
            <div className="flex items-end gap-1.5 h-24">
              {agg.last14Days.map((day) => {
                const count = agg.dailyViewCounts[day] ?? 0;
                const pxH = Math.max(
                  Math.round((count / agg.maxDailyViewCount) * 96),
                  2,
                );
                return (
                  <div
                    key={day}
                    className="flex flex-col items-center justify-end flex-1 h-full"
                  >
                    <div
                      className="w-full bg-info/50 rounded-t-sm"
                      style={{ height: `${pxH}px` }}
                      title={`${day}: ${count}件`}
                    />
                    <span className="text-[9px] text-muted mt-1.5 whitespace-nowrap">
                      {day.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 媒体別 ── */}
        <div className="grid grid-cols-2 gap-5">
          {/* 検索媒体別 */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-4">
              検索媒体別（今月）
            </div>
            {agg.totalSources === 0 ? (
              <p className="text-sm text-muted">データなし</p>
            ) : (
              <div className="flex flex-col gap-0">
                {Object.entries(agg.sourceCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([src, count]) => {
                    const pct =
                      agg.totalSources > 0
                        ? Math.round((count / agg.totalSources) * 100)
                        : 0;
                    return (
                      <div
                        key={src}
                        className="flex items-center py-2.5 border-b border-border last:border-0 text-sm"
                      >
                        <span className="w-28 shrink-0 text-foreground">
                          {SOURCE_LABEL[src] ?? src}
                        </span>
                        <div className="flex-1 mx-4 h-1.5 bg-border rounded-full">
                          <div
                            className="h-full bg-primary/50 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-semibold text-foreground w-10 text-right">
                          {count}
                        </span>
                        <span className="text-muted text-xs w-10 text-right">{pct}%</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* 閲覧媒体別 */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-4">
              詳細ページ閲覧媒体別（今月）
            </div>
            {agg.totalViewSources === 0 ? (
              <p className="text-sm text-muted">データなし</p>
            ) : (
              <div className="flex flex-col gap-0">
                {Object.entries(agg.viewSourceCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([src, count]) => {
                    const pct =
                      agg.totalViewSources > 0
                        ? Math.round((count / agg.totalViewSources) * 100)
                        : 0;
                    return (
                      <div
                        key={src}
                        className="flex items-center py-2.5 border-b border-border last:border-0 text-sm"
                      >
                        <span className="w-28 shrink-0 text-foreground">
                          {SOURCE_LABEL[src] ?? src}
                        </span>
                        <div className="flex-1 mx-4 h-1.5 bg-border rounded-full">
                          <div
                            className="h-full bg-info/50 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-semibold text-foreground w-10 text-right">
                          {count}
                        </span>
                        <span className="text-muted text-xs w-10 text-right">{pct}%</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* ── ① スクレイパー稼働状況 ── */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
            スクレイパー稼働状況（直近 7 日）
          </div>
          <div className="grid grid-cols-3 gap-4">
            {agg.scraperStats.map(({ src, total, errors, errorRate, level }) => (
              <div key={src} className="bg-surface border border-border rounded-xl px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-semibold text-foreground">
                    {SOURCE_LABEL[src] ?? src}
                  </span>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      level === "ok"
                        ? "bg-success/12 text-success"
                        : level === "warn"
                          ? "bg-warning/12 text-warning"
                          : "bg-danger/12 text-danger"
                    }`}
                  >
                    {level === "ok" ? "正常" : level === "warn" ? "注意" : "異常"}
                  </span>
                </div>
                <div className="text-3xl font-bold leading-none text-foreground">
                  {errorRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted mt-1.5">エラー率</div>
                <div className="text-xs text-muted mt-2">
                  検索 {total} 件 / エラー {errors} 件
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ④ 転換率 ＋ ⑤ 空振り ── */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
            検索品質（今月）
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-surface border border-border rounded-xl px-6 py-5">
              <div className="text-xs text-muted mb-1.5">検索→閲覧 転換率</div>
              <div className="text-3xl font-bold text-foreground leading-none">
                {agg.conversionRate}%
              </div>
              <div className="text-xs text-muted mt-1.5">
                完了検索 1 件あたりの閲覧数
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl px-6 py-5">
              <div className="text-xs text-muted mb-1.5">閲覧ユーザー率</div>
              <div className="text-3xl font-bold text-foreground leading-none">
                {agg.userConversionRate}%
              </div>
              <div className="text-xs text-muted mt-1.5">
                検索ユーザーのうち詳細も閲覧
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl px-6 py-5">
              <div className="text-xs text-muted mb-1.5">空振り検索数</div>
              <div
                className={`text-3xl font-bold leading-none ${agg.zeroResultCount > 0 ? "text-warning" : "text-foreground"}`}
              >
                {agg.zeroResultCount}
              </div>
              <div className="text-xs text-muted mt-1.5">結果 0 件の完了検索</div>
            </div>
            <div className="bg-surface border border-border rounded-xl px-6 py-5">
              <div className="text-xs text-muted mb-1.5">空振り率</div>
              <div
                className={`text-3xl font-bold leading-none ${Number(agg.zeroResultRate) >= 10 ? "text-warning" : "text-foreground"}`}
              >
                {agg.zeroResultRate}%
              </div>
              <div className="text-xs text-muted mt-1.5">
                {Object.entries(agg.zeroSourceCounts)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 2)
                  .map(([src, n]) => `${SOURCE_LABEL[src] ?? src} ${n}件`)
                  .join(" / ") || "問題なし"}
              </div>
            </div>
          </div>
        </div>

        {/* ── ⑤ 空振り検索テーブル ── */}
        <div className="bg-surface border border-warning/30 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-warning/5">
            <div>
              <h2 className="text-[13px] font-bold text-warning">空振り検索ログ</h2>
              <p className="text-xs text-muted mt-0.5">
                今月 {agg.zeroResultCount} 件 — 結果が 0 件だった完了検索。キーワードや媒体の見直しに活用してください
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr>
                  {["日時", "ユーザー", "キーワード", "媒体"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider bg-surface-2 border-b border-border whitespace-nowrap text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentZeroResults.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-success text-sm">
                      ✓ 今月の空振り検索はありません
                    </td>
                  </tr>
                ) : (
                  recentZeroResults.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-surface-2 border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {fmtDate(s.searched_at)}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[140px] truncate">
                        {(userEmailMap[s.user_id] ?? s.user_id).split("@")[0]}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground max-w-[240px] truncate">
                        {s.keyword}
                      </td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {s.sources.map((src) => SOURCE_LABEL[src] ?? src).join(" / ")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── エラーログ ── */}
        <div className="bg-surface border border-danger/30 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-danger/5">
            <div>
              <h2 className="text-[13px] font-bold text-danger">エラーログ</h2>
              <p className="text-xs text-muted mt-0.5">
                直近 30 日 / 未対処 {recentErrors.length} 件
                {archivedErrors.length > 0 && <> / 対処済み {archivedErrors.length} 件</>}
                {recentErrors.length > 0 && <>&nbsp;—&nbsp;「修正依頼」を Claude Code へ、「ヒアリング」を担当ユーザーへ送付できます</>}
              </p>
            </div>
          </div>
          {/* 未対処エラー */}
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr>
                  {["日時", "担当ユーザー", "キーワード", "媒体", "エンジニア修正依頼", "ユーザーヒアリング", ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        className={`px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider bg-surface-2 border-b border-border whitespace-nowrap ${i >= 4 ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {recentErrors.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-success text-sm">
                      ✓ 直近 30 日間に未対処のエラーはありません
                    </td>
                  </tr>
                ) : (
                  recentErrors.map((s) => {
                    const email = userEmailMap[s.user_id] ?? "（ユーザー不明）";
                    const isKnownUser = !!userEmailMap[s.user_id];
                    const fixPrompt = buildFixPrompt(s, email);
                    const hearingPrompt = buildHearingPrompt(s, email);
                    return (
                      <tr
                        key={s.id}
                        className="hover:bg-surface-2 border-b border-border last:border-0"
                      >
                        <td className="px-4 py-3 text-muted whitespace-nowrap">
                          {fmtDate(s.searched_at)}
                        </td>
                        <td className="px-4 py-3 max-w-[160px]">
                          {isKnownUser ? (
                            <div>
                              <div className="text-foreground font-medium truncate">
                                {email.split("@")[0]}
                              </div>
                              <div className="text-muted text-[10px] truncate">{email}</div>
                            </div>
                          ) : (
                            <span className="text-muted text-[11px]">不明</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground max-w-[180px] truncate">
                          {s.keyword}
                        </td>
                        <td className="px-4 py-3 text-muted whitespace-nowrap">
                          {s.sources.map((src) => SOURCE_LABEL[src] ?? src).join(" / ")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <CopyPromptButton prompt={fixPrompt} label="修正依頼をコピー" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <CopyPromptButton
                            prompt={hearingPrompt}
                            label={isKnownUser ? "ヒアリングをコピー" : "ヒアリング（要特定）"}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ArchiveButton searchId={s.id} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 対処済みエラー（折りたたみ） */}
          {archivedErrors.length > 0 && (
            <details className="border-t border-border">
              <summary className="px-5 py-3 text-[12px] text-muted cursor-pointer hover:bg-surface-2 select-none list-none flex items-center gap-2">
                <span className="text-success font-semibold">✓ 対処済み {archivedErrors.length} 件</span>
                <span>（クリックで表示）</span>
              </summary>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr>
                      {["日時", "担当ユーザー", "キーワード", "媒体", "対処日時", ""].map((h, i) => (
                        <th
                          key={i}
                          className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider bg-surface-2 border-b border-border whitespace-nowrap text-left"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {archivedErrors.map((s) => {
                      const email = userEmailMap[s.user_id] ?? "（ユーザー不明）";
                      return (
                        <tr
                          key={s.id}
                          className="hover:bg-surface-2 border-b border-border last:border-0 opacity-60"
                        >
                          <td className="px-4 py-3 text-muted whitespace-nowrap">
                            {fmtDate(s.searched_at)}
                          </td>
                          <td className="px-4 py-3 text-foreground max-w-[140px] truncate">
                            {email.split("@")[0]}
                          </td>
                          <td className="px-4 py-3 font-semibold text-foreground max-w-[180px] truncate">
                            {s.keyword}
                          </td>
                          <td className="px-4 py-3 text-muted whitespace-nowrap">
                            {s.sources.map((src) => SOURCE_LABEL[src] ?? src).join(" / ")}
                          </td>
                          <td className="px-4 py-3 text-muted whitespace-nowrap text-[11px]">
                            {s.archived_at ? fmtDate(s.archived_at) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <UnarchiveButton searchId={s.id} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>

        {/* ── 詳細ページ閲覧ログ ── */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-[13px] font-bold">詳細ページ閲覧ログ</h2>
            <span className="text-xs text-muted">直近 100 件</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr>
                  {["日時", "ユーザー", "商品名", "媒体", "価格", "検索キーワード"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider bg-surface-2 border-b border-border whitespace-nowrap ${i >= 4 ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {recentViews.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">
                      データなし
                    </td>
                  </tr>
                ) : (
                  recentViews.map((v) => (
                    <tr
                      key={v.id}
                      className="hover:bg-surface-2 border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {fmtDate(v.viewed_at)}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[120px] truncate">
                        {(userEmailMap[v.user_id] ?? v.user_id).split("@")[0]}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[220px] truncate">
                        {v.title}
                      </td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {SOURCE_LABEL[v.source] ?? v.source}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground font-semibold whitespace-nowrap">
                        ¥{v.price.toLocaleString("ja-JP")}
                      </td>
                      <td className="px-4 py-3 text-muted max-w-[160px] truncate text-xs">
                        {v.from_keyword ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 査定ステータス集計 ── */}
        <section className="bg-surface border border-border rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">査定ステータス集計</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-surface-2 rounded-lg">
              <div className="text-2xl font-bold text-foreground">{statusCounts.pending}</div>
              <div className="text-xs text-muted mt-1">未査定</div>
            </div>
            <div className="text-center p-3 bg-success/10 rounded-lg">
              <div className="text-2xl font-bold text-success">{statusCounts.accepted}</div>
              <div className="text-xs text-muted mt-1">承認済み</div>
            </div>
            <div className="text-center p-3 bg-danger/10 rounded-lg">
              <div className="text-2xl font-bold text-danger">{statusCounts.rejected}</div>
              <div className="text-xs text-muted mt-1">却下済み</div>
            </div>
          </div>
        </section>

        {/* ── スクレイピング状態（直近7日） ── */}
        <section className="bg-surface border border-border rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-1">スクレイピング状態（直近7日）</h2>
          <p className="text-xs text-muted mb-3">各媒体のデータ取得の成功率です</p>
          <div className="grid grid-cols-3 gap-3">
            {scrapeHealth.map(h => {
              const color = h.successRate === null ? 'text-muted'
                : h.successRate >= 90 ? 'text-success'
                : h.successRate >= 70 ? 'text-warning'
                : 'text-danger';
              return (
                <div key={h.key} className="text-center p-3 bg-surface-2 rounded-lg">
                  <div className={`text-2xl font-bold ${color}`}>
                    {h.successRate === null ? '—' : `${h.successRate}%`}
                  </div>
                  <div className="text-xs font-medium text-foreground mt-1">{h.label}</div>
                  <div className="text-[10px] text-muted mt-0.5">
                    {h.total === 0 ? '検索なし' : `${h.total}件中 ${h.errors}件エラー`}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 検索アクティビティテーブル ── */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-[13px] font-bold">検索アクティビティ</h2>
            <span className="text-xs text-muted">直近 200 件</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr>
                  {["日時", "ユーザー", "キーワード", "媒体", "状態", "件数", "中央値"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider bg-surface-2 border-b border-border whitespace-nowrap ${i >= 5 ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {recent200.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted text-sm">
                      データなし
                    </td>
                  </tr>
                ) : (
                  recent200.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-surface-2 border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {fmtDate(s.searched_at)}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[140px] truncate">
                        {(userEmailMap[s.user_id] ?? s.user_id).split("@")[0]}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground max-w-[200px] truncate">
                        {s.keyword}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {s.sources.map((src) => SOURCE_LABEL[src] ?? src).join(" / ")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            s.status === "completed"
                              ? "bg-success/12 text-success"
                              : s.status === "error"
                                ? "bg-danger/12 text-danger"
                                : s.status === "running"
                                  ? "bg-info/12 text-info"
                                  : "bg-muted/15 text-muted"
                          }`}
                        >
                          {STATUS_LABEL[s.status] ?? s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {s.total_count != null
                          ? s.total_count.toLocaleString("ja-JP")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {s.median != null ? `¥${s.median.toLocaleString("ja-JP")}` : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}
