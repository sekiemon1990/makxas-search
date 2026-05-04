import { createServiceClient } from "@/lib/supabase/service";
import { CopyPromptButton } from "@/components/CopyPromptButton";

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
    .select("id, user_id, keyword, sources, status, searched_at, total_count, median")
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

  // ユーザーメールマップ
  const {
    data: { users },
  } = await service.auth.admin.listUsers({ perPage: 1000 });
  const userEmailMap: Record<string, string> = {};
  users.forEach((u) => {
    userEmailMap[u.id] = u.email ?? u.id.slice(0, 8);
  });

  return {
    searches: (searches ?? []) as SearchRow[],
    views: (views ?? []) as ViewRow[],
    userEmailMap,
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
  };
}

// ──────────────────────────────────────────────
// ページ
// ──────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const { searches, views, userEmailMap } = await fetchDashboardData();
  const agg = aggregate(searches, views);
  const recent200 = searches.slice(0, 200);

  // エラー一覧（直近30件）
  const recentErrors = searches.filter((s) => s.status === "error").slice(0, 30);

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

        {/* ── エラーログ ── */}
        {recentErrors.length > 0 && (
          <div className="bg-surface border border-danger/30 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-danger/5">
              <div>
                <h2 className="text-[13px] font-bold text-danger">エラーログ</h2>
                <p className="text-xs text-muted mt-0.5">
                  直近 30 日 / {recentErrors.length} 件
                  &nbsp;—&nbsp;「修正依頼」を Claude Code へ、「ヒアリング」を担当ユーザーへ送付できます
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr>
                    {["日時", "担当ユーザー", "キーワード", "媒体", "エンジニア修正依頼", "ユーザーヒアリング"].map(
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
                  {recentErrors.map((s) => {
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
