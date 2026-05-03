import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AppShell } from "@/components/AppShell";
import { BarChart3, Users, Zap, DollarSign, TrendingUp } from "lucide-react";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

type UsageRow = {
  endpoint: string;
  model: string;
  cost_usd: number;
  created_at: string;
  user_id: string | null;
};

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

// ──────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────

function formatUsd(v: number) {
  return v < 0.01
    ? `$${v.toFixed(5)}`
    : `$${v.toFixed(4)}`;
}

function formatJpy(usd: number) {
  const jpy = Math.round(usd * 155); // 概算レート
  return `≈ ¥${jpy.toLocaleString("ja-JP")}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SOURCE_LABEL: Record<string, string> = {
  yahoo_auction: "ヤフオク",
  mercari: "メルカリ",
  jimoty: "ジモティー",
};

const ENDPOINT_LABEL: Record<string, string> = {
  "ai-advisor": "AI 査定",
  "detect-accessories": "付属品検出",
  "keyword-suggest": "キーワード候補",
  "refine-keywords": "絞り込み提案",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "完了",
  running: "実行中",
  queued: "待機中",
  error: "エラー",
  cancelled: "中止",
};

// ──────────────────────────────────────────────
// データ取得
// ──────────────────────────────────────────────

async function fetchAdminData() {
  const service = createServiceClient();

  // 検索ログ（直近 200 件）
  const { data: searches } = await service
    .from("searches")
    .select("id, user_id, keyword, sources, status, searched_at, total_count, median")
    .order("searched_at", { ascending: false })
    .limit(200);

  // API 使用量ログ（直近 30 日）
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: usageLogs } = await service
    .from("api_usage_logs")
    .select("endpoint, model, cost_usd, created_at, user_id")
    .gte("created_at", since30d)
    .order("created_at", { ascending: false });

  // ユーザーメールを取得（検索ログに登場する user_id 分のみ）
  const userIdSet = new Set<string>();
  (searches ?? []).forEach((s: SearchRow) => userIdSet.add(s.user_id));
  (usageLogs ?? []).forEach((u: UsageRow) => u.user_id && userIdSet.add(u.user_id));

  const userEmailMap: Record<string, string> = {};
  if (userIdSet.size > 0) {
    const { data: { users } } = await service.auth.admin.listUsers({ perPage: 1000 });
    users.forEach((u) => {
      userEmailMap[u.id] = u.email ?? u.id.slice(0, 8);
    });
  }

  return {
    searches: (searches ?? []) as SearchRow[],
    usageLogs: (usageLogs ?? []) as UsageRow[],
    userEmailMap,
  };
}

// ──────────────────────────────────────────────
// コスト集計
// ──────────────────────────────────────────────

function aggregateCosts(logs: UsageRow[]) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);

  let todayCost = 0;
  let monthCost = 0;
  let totalCost = 0;

  const byEndpoint: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  const byUser: Record<string, number> = {};

  // 日次コスト（過去 30 日）
  const dailyCost: Record<string, number> = {};

  for (const log of logs) {
    const cost = Number(log.cost_usd);
    const day = log.created_at.slice(0, 10);

    totalCost += cost;
    if (day === todayStr) todayCost += cost;
    if (log.created_at.slice(0, 7) === monthStr) monthCost += cost;

    byEndpoint[log.endpoint] = (byEndpoint[log.endpoint] ?? 0) + cost;
    byModel[log.model] = (byModel[log.model] ?? 0) + cost;
    if (log.user_id) {
      byUser[log.user_id] = (byUser[log.user_id] ?? 0) + cost;
    }
    dailyCost[day] = (dailyCost[day] ?? 0) + cost;
  }

  return { todayCost, monthCost, totalCost, byEndpoint, byModel, byUser, dailyCost };
}

// ──────────────────────────────────────────────
// ページ
// ──────────────────────────────────────────────

export default async function AdminPage() {
  // 認証確認（middleware でも弾くが Server Component でも二重チェック）
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (!adminEmails.includes(user.email ?? "")) redirect("/search");

  const { searches, usageLogs, userEmailMap } = await fetchAdminData();
  const costs = aggregateCosts(usageLogs);

  // 直近 14 日の日次コスト
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const maxDailyCost = Math.max(...last14Days.map((d) => costs.dailyCost[d] ?? 0), 0.0001);

  return (
    <AppShell title="管理画面" back={{ href: "/search", label: "戻る" }}>
      <div className="flex flex-col gap-6 pb-8">

        {/* ── コストサマリー ── */}
        <section>
          <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
            <DollarSign size={16} className="text-primary" />
            Anthropic API コスト（直近 30 日）
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "今日", cost: costs.todayCost },
              { label: "今月", cost: costs.monthCost },
              { label: "直近 30 日", cost: costs.totalCost },
            ].map(({ label, cost }) => (
              <div
                key={label}
                className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-1"
              >
                <span className="text-xs text-muted">{label}</span>
                <span className="text-lg font-bold text-foreground">
                  {formatUsd(cost)}
                </span>
                <span className="text-xs text-muted">{formatJpy(cost)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 日次コストグラフ（テキストバー）── */}
        <section className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-primary" />
            日次コスト（直近 14 日）
          </h3>
          <div className="flex items-end gap-1 h-20">
            {last14Days.map((day) => {
              const cost = costs.dailyCost[day] ?? 0;
              const pct = (cost / maxDailyCost) * 100;
              return (
                <div key={day} className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className="w-full bg-primary/70 rounded-sm min-h-[2px]"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                    title={`${day}: ${formatUsd(cost)}`}
                  />
                  <span className="text-[9px] text-muted rotate-[-45deg] origin-top-right whitespace-nowrap">
                    {day.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── エンドポイント別・モデル別 内訳 ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* エンドポイント別 */}
          <section className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Zap size={14} className="text-primary" />
              エンドポイント別
            </h3>
            {Object.keys(ENDPOINT_LABEL).length === 0 ||
            Object.keys(costs.byEndpoint).length === 0 ? (
              <p className="text-xs text-muted">データなし</p>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(costs.byEndpoint)
                  .sort(([, a], [, b]) => b - a)
                  .map(([ep, cost]) => (
                    <div key={ep} className="flex justify-between text-xs">
                      <span className="text-foreground">
                        {ENDPOINT_LABEL[ep] ?? ep}
                      </span>
                      <span className="text-muted font-mono">{formatUsd(cost)}</span>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* モデル別 */}
          <section className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <BarChart3 size={14} className="text-primary" />
              モデル別
            </h3>
            {Object.keys(costs.byModel).length === 0 ? (
              <p className="text-xs text-muted">データなし</p>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(costs.byModel)
                  .sort(([, a], [, b]) => b - a)
                  .map(([model, cost]) => (
                    <div key={model} className="flex justify-between text-xs">
                      <span className="text-foreground truncate max-w-[120px]">
                        {model.replace("claude-", "")}
                      </span>
                      <span className="text-muted font-mono">{formatUsd(cost)}</span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>

        {/* ── ユーザー別コスト ── */}
        {Object.keys(costs.byUser).length > 0 && (
          <section className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Users size={14} className="text-primary" />
              ユーザー別コスト（上位 10 名）
            </h3>
            <div className="flex flex-col gap-2">
              {Object.entries(costs.byUser)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([uid, cost]) => (
                  <div key={uid} className="flex justify-between text-xs">
                    <span className="text-foreground truncate max-w-[220px]">
                      {userEmailMap[uid] ?? uid.slice(0, 8) + "..."}
                    </span>
                    <span className="text-muted font-mono">{formatUsd(cost)}</span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* ── 検索アクティビティ ── */}
        <section>
          <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
            <Users size={16} className="text-primary" />
            検索アクティビティ（直近 200 件）
          </h2>
          {searches.length === 0 ? (
            <p className="text-sm text-muted">データなし</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs border-separate border-spacing-0 min-w-[600px]">
                <thead>
                  <tr className="text-muted text-left">
                    <th className="pb-2 pr-3 font-medium">日時</th>
                    <th className="pb-2 pr-3 font-medium">ユーザー</th>
                    <th className="pb-2 pr-3 font-medium">キーワード</th>
                    <th className="pb-2 pr-3 font-medium">媒体</th>
                    <th className="pb-2 pr-3 font-medium">状態</th>
                    <th className="pb-2 pr-3 font-medium text-right">件数</th>
                    <th className="pb-2 font-medium text-right">中央値</th>
                  </tr>
                </thead>
                <tbody>
                  {searches.map((s) => (
                    <tr
                      key={s.id}
                      className="border-t border-border hover:bg-surface/60"
                    >
                      <td className="py-2 pr-3 text-muted whitespace-nowrap">
                        {fmtDate(s.searched_at)}
                      </td>
                      <td className="py-2 pr-3 text-foreground truncate max-w-[160px]">
                        {userEmailMap[s.user_id]
                          ? userEmailMap[s.user_id].split("@")[0]
                          : s.user_id.slice(0, 6) + "…"}
                      </td>
                      <td className="py-2 pr-3 text-foreground font-medium max-w-[200px] truncate">
                        {s.keyword}
                      </td>
                      <td className="py-2 pr-3 text-muted">
                        {s.sources
                          .map((src) => SOURCE_LABEL[src] ?? src)
                          .join("/")}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            s.status === "completed"
                              ? "bg-green-500/15 text-green-600"
                              : s.status === "error"
                                ? "bg-red-500/15 text-red-600"
                                : s.status === "running"
                                  ? "bg-blue-500/15 text-blue-600"
                                  : "bg-muted/20 text-muted"
                          }`}
                        >
                          {STATUS_LABEL[s.status] ?? s.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right text-muted">
                        {s.total_count != null ? s.total_count.toLocaleString("ja-JP") : "—"}
                      </td>
                      <td className="py-2 text-right text-muted">
                        {s.median != null
                          ? `¥${s.median.toLocaleString("ja-JP")}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
