import { createServiceClient } from "@/lib/supabase/service";

// ──────────────────────────────────────────────
// 定数
// ──────────────────────────────────────────────

const JPY_RATE = 155; // USD → JPY換算レート（固定）

const ENDPOINT_LABEL: Record<string, string> = {
  "ai-advisor": "AI査定アドバイス",
  "detect-accessories": "付属品検出",
  "keyword-suggest": "キーワード提案",
  "refine-keywords": "キーワード絞り込み",
};

const MODEL_LABEL: Record<string, string> = {
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-haiku-4-5": "Claude Haiku 4.5",
};

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

type UsageRow = {
  id: string;
  user_id: string | null;
  endpoint: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  created_at: string;
};

// ──────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────

function fmtJpy(usd: number): string {
  const jpy = Math.round(usd * JPY_RATE);
  return `¥${jpy.toLocaleString("ja-JP")}`;
}

function fmtUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ──────────────────────────────────────────────
// データ取得
// ──────────────────────────────────────────────

async function fetchCostData() {
  const service = createServiceClient();

  const today = new Date().toISOString().slice(0, 10);
  const monthStr = new Date().toISOString().slice(0, 7);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: allLogs }, { data: { users } }] = await Promise.all([
    service
      .from("api_usage_logs")
      .select(
        "id, user_id, endpoint, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, created_at",
      )
      .gte("created_at", since30d)
      .order("created_at", { ascending: false })
      .limit(5000),
    service.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const logs = (allLogs ?? []) as UsageRow[];

  const userEmailMap: Record<string, string> = {};
  users.forEach((u) => {
    userEmailMap[u.id] = u.email ?? u.id.slice(0, 8);
  });

  return { logs, userEmailMap, today, monthStr };
}

// ──────────────────────────────────────────────
// 集計
// ──────────────────────────────────────────────

function aggregate(logs: UsageRow[], today: string, monthStr: string) {
  const todayLogs = logs.filter((l) => l.created_at.startsWith(today));
  const monthLogs = logs.filter((l) => l.created_at.startsWith(monthStr));

  const sumCost = (rows: UsageRow[]) =>
    rows.reduce((acc, r) => acc + Number(r.cost_usd), 0);

  // 日次コスト（直近30日）
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const dailyCostUsd: Record<string, number> = {};
  logs.forEach((l) => {
    const day = l.created_at.slice(0, 10);
    dailyCostUsd[day] = (dailyCostUsd[day] ?? 0) + Number(l.cost_usd);
  });
  const maxDailyCost = Math.max(...last30Days.map((d) => dailyCostUsd[d] ?? 0), 0.0001);

  // エンドポイント別（今月）
  const endpointCosts: Record<string, number> = {};
  monthLogs.forEach((l) => {
    endpointCosts[l.endpoint] = (endpointCosts[l.endpoint] ?? 0) + Number(l.cost_usd);
  });
  const totalEndpointCost = Object.values(endpointCosts).reduce((a, b) => a + b, 0);

  // モデル別（今月）
  const modelCosts: Record<string, number> = {};
  const modelCalls: Record<string, number> = {};
  monthLogs.forEach((l) => {
    modelCosts[l.model] = (modelCosts[l.model] ?? 0) + Number(l.cost_usd);
    modelCalls[l.model] = (modelCalls[l.model] ?? 0) + 1;
  });

  // ユーザー別（今月）TOP 10
  const userCosts: Record<string, number> = {};
  const userCalls: Record<string, number> = {};
  monthLogs.forEach((l) => {
    const uid = l.user_id ?? "__anon__";
    userCosts[uid] = (userCosts[uid] ?? 0) + Number(l.cost_usd);
    userCalls[uid] = (userCalls[uid] ?? 0) + 1;
  });
  const topUsers = Object.entries(userCosts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return {
    todayCost: sumCost(todayLogs),
    monthCost: sumCost(monthLogs),
    totalCost: sumCost(logs),
    todayCallCount: todayLogs.length,
    monthCallCount: monthLogs.length,
    last30Days,
    dailyCostUsd,
    maxDailyCost,
    endpointCosts,
    totalEndpointCost,
    modelCosts,
    modelCalls,
    userCosts,
    userCalls,
    topUsers,
  };
}

// ──────────────────────────────────────────────
// ページ
// ──────────────────────────────────────────────

export default async function AdminCostsPage() {
  const { logs, userEmailMap, today, monthStr } = await fetchCostData();
  const agg = aggregate(logs, today, monthStr);
  const recent50 = logs.slice(0, 50);

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
          <h1 className="text-[16px] font-bold">Anthropic API コスト詳細</h1>
          <p className="text-xs text-muted">
            換算レート: ¥{JPY_RATE}/USD（固定） / 直近 30 日のデータ
          </p>
        </div>
        <span className="text-xs text-muted">{now} 現在</span>
      </div>

      <div className="p-8 flex flex-col gap-6 max-w-[1200px]">

        {/* ── サマリーカード ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "今日のコスト",
              jpy: fmtJpy(agg.todayCost),
              usd: fmtUsd(agg.todayCost),
              sub: `API呼出 ${agg.todayCallCount} 回`,
            },
            {
              label: "今月のコスト",
              jpy: fmtJpy(agg.monthCost),
              usd: fmtUsd(agg.monthCost),
              sub: `API呼出 ${agg.monthCallCount} 回`,
            },
            {
              label: "直近 30 日 累計",
              jpy: fmtJpy(agg.totalCost),
              usd: fmtUsd(agg.totalCost),
              sub: `API呼出 ${logs.length} 回`,
            },
          ].map(({ label, jpy, usd, sub }) => (
            <div key={label} className="bg-surface border border-border rounded-xl px-6 py-5">
              <div className="text-xs text-muted mb-1.5">{label}</div>
              <div className="text-3xl font-bold text-foreground leading-none">{jpy}</div>
              <div className="text-xs text-muted mt-1">{usd}</div>
              <div className="text-xs text-muted mt-1.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* ── 日次コストグラフ ── */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-4">
            日次コスト推移（直近 30 日）
          </div>
          <div className="flex items-end gap-1 h-28">
            {agg.last30Days.map((day) => {
              const cost = agg.dailyCostUsd[day] ?? 0;
              const pxH = Math.max(Math.round((cost / agg.maxDailyCost) * 112), 2);
              const jpy = Math.round(cost * JPY_RATE);
              return (
                <div
                  key={day}
                  className="flex flex-col items-center justify-end flex-1 h-full"
                >
                  <div
                    className="w-full bg-primary/60 rounded-t-sm"
                    style={{ height: `${pxH}px` }}
                    title={`${day}: ¥${jpy.toLocaleString("ja-JP")} (${fmtUsd(cost)})`}
                  />
                  {/* 7日ごとにラベル表示 */}
                  {[0, 6, 13, 20, 29].includes(agg.last30Days.indexOf(day)) && (
                    <span className="text-[8px] text-muted mt-1 whitespace-nowrap">
                      {day.slice(5)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── エンドポイント別 + モデル別 ── */}
        <div className="grid grid-cols-2 gap-5">
          {/* エンドポイント別 */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-4">
              エンドポイント別コスト（今月）
            </div>
            {agg.totalEndpointCost === 0 ? (
              <p className="text-sm text-muted">データなし</p>
            ) : (
              <div className="flex flex-col gap-0">
                {Object.entries(agg.endpointCosts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([ep, cost]) => {
                    const pct =
                      agg.totalEndpointCost > 0
                        ? Math.round((cost / agg.totalEndpointCost) * 100)
                        : 0;
                    return (
                      <div
                        key={ep}
                        className="flex items-center py-2.5 border-b border-border last:border-0 text-sm"
                      >
                        <span className="w-40 shrink-0 text-foreground text-[12px]">
                          {ENDPOINT_LABEL[ep] ?? ep}
                        </span>
                        <div className="flex-1 mx-3 h-1.5 bg-border rounded-full">
                          <div
                            className="h-full bg-primary/50 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-right min-w-[80px]">
                          <div className="font-semibold text-foreground text-[12px]">
                            {fmtJpy(cost)}
                          </div>
                          <div className="text-muted text-[10px]">{fmtUsd(cost)}</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* モデル別 */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-4">
              モデル別コスト（今月）
            </div>
            {Object.keys(agg.modelCosts).length === 0 ? (
              <p className="text-sm text-muted">データなし</p>
            ) : (
              <div className="flex flex-col gap-0">
                {Object.entries(agg.modelCosts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([model, cost]) => {
                    const total = Object.values(agg.modelCosts).reduce(
                      (a, b) => a + b,
                      0,
                    );
                    const pct =
                      total > 0 ? Math.round((cost / total) * 100) : 0;
                    return (
                      <div
                        key={model}
                        className="flex items-center py-2.5 border-b border-border last:border-0 text-sm"
                      >
                        <div className="w-44 shrink-0">
                          <div className="text-foreground text-[12px] font-medium">
                            {MODEL_LABEL[model] ?? model}
                          </div>
                          <div className="text-muted text-[10px]">
                            {(agg.modelCalls[model] ?? 0).toLocaleString("ja-JP")} 回
                          </div>
                        </div>
                        <div className="flex-1 mx-3 h-1.5 bg-border rounded-full">
                          <div
                            className="h-full bg-primary/50 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-right min-w-[80px]">
                          <div className="font-semibold text-foreground text-[12px]">
                            {fmtJpy(cost)}
                          </div>
                          <div className="text-muted text-[10px]">{fmtUsd(cost)}</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* ── ユーザー別コスト TOP 10 ── */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-4">
            ユーザー別コスト TOP 10（今月）
          </div>
          {agg.topUsers.length === 0 ? (
            <p className="text-sm text-muted">データなし</p>
          ) : (
            <div className="flex flex-col gap-0">
              {agg.topUsers.map(([userId, cost], idx) => {
                const total = Object.values(agg.userCosts).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((cost / total) * 100) : 0;
                const email =
                  userId === "__anon__"
                    ? "匿名"
                    : (userEmailMap[userId] ?? userId);
                return (
                  <div
                    key={userId}
                    className="flex items-center py-2.5 border-b border-border last:border-0 text-sm"
                  >
                    <span className="w-6 shrink-0 text-muted text-[11px] font-bold">
                      {idx + 1}
                    </span>
                    <div className="w-48 shrink-0">
                      <div className="text-foreground text-[12px] truncate">
                        {email.split("@")[0]}
                      </div>
                      <div className="text-muted text-[10px] truncate">{email}</div>
                    </div>
                    <div className="flex-1 mx-3 h-1.5 bg-border rounded-full">
                      <div
                        className="h-full bg-primary/50 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-muted text-xs w-12 text-right shrink-0">
                      {(agg.userCalls[userId] ?? 0)} 回
                    </span>
                    <div className="text-right min-w-[90px]">
                      <div className="font-semibold text-foreground text-[12px]">
                        {fmtJpy(cost)}
                      </div>
                      <div className="text-muted text-[10px]">{fmtUsd(cost)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 直近ログ ── */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-[13px] font-bold">API使用ログ</h2>
            <span className="text-xs text-muted">直近 50 件</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr>
                  {[
                    "日時",
                    "ユーザー",
                    "エンドポイント",
                    "モデル",
                    "In",
                    "Out",
                    "コスト",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider bg-surface-2 border-b border-border whitespace-nowrap ${i >= 4 ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent50.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-muted text-sm"
                    >
                      データなし（APIを使用するとここに記録されます）
                    </td>
                  </tr>
                ) : (
                  recent50.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-surface-2 border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {fmtDate(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[120px] truncate">
                        {log.user_id
                          ? (userEmailMap[log.user_id] ?? log.user_id).split("@")[0]
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {ENDPOINT_LABEL[log.endpoint] ?? log.endpoint}
                      </td>
                      <td className="px-4 py-3 text-muted text-[11px]">
                        {MODEL_LABEL[log.model] ?? log.model}
                      </td>
                      <td className="px-4 py-3 text-right text-muted text-[11px] tabular-nums">
                        {log.input_tokens.toLocaleString("ja-JP")}
                      </td>
                      <td className="px-4 py-3 text-right text-muted text-[11px] tabular-nums">
                        {log.output_tokens.toLocaleString("ja-JP")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-foreground text-[12px]">
                          {fmtJpy(Number(log.cost_usd))}
                        </div>
                        <div className="text-muted text-[10px]">
                          {fmtUsd(Number(log.cost_usd))}
                        </div>
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
