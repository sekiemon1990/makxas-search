"use client";

import { useState, useEffect, useCallback } from "react";
import type { ContractedProject } from "@/lib/core-rails/client";

const METHOD_LABELS: Record<string, string> = {
  visit: "出張",
  by_visit: "出張",
  store: "店頭",
  by_store: "店頭",
  mail: "宅配",
  by_mail: "宅配",
};

export function ContractedProjectsPanel() {
  const [projects, setProjects] = useState<ContractedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [connected, setConnected] = useState<boolean | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/core-rails/contracted-projects?days=${d}`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "取得失敗");
      }
      const body = (await res.json()) as { projects: ContractedProject[] };
      setProjects(body.projects);
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラー");
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [load, days]);

  const totalItems = projects.reduce(
    (sum, p) => sum + (p.acceptedItems?.length ?? 0),
    0
  );
  const totalAmount = projects.reduce(
    (sum, p) =>
      sum +
      (p.acceptedItems?.reduce((s, i) => s + (i.actualAmount ?? 0), 0) ?? 0),
    0
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">成約案件（マクサスコア）</h2>
          {connected !== null && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                connected
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {connected ? "接続中" : "未接続"}
            </span>
          )}
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-xs border border-border rounded px-2 py-1 bg-surface"
        >
          <option value={7}>直近7日</option>
          <option value={30}>直近30日</option>
          <option value={90}>直近90日</option>
        </select>
      </div>

      {loading && (
        <p className="text-xs text-muted py-4 text-center">読み込み中...</p>
      )}

      {error && !loading && (
        <p className="text-xs text-error py-2">{error}</p>
      )}

      {!loading && !error && connected && (
        <>
          <div className="flex gap-4 mb-3 text-xs text-muted">
            <span>
              成約件数:{" "}
              <strong className="text-foreground">{projects.length}件</strong>
            </span>
            <span>
              査定品目:{" "}
              <strong className="text-foreground">{totalItems}点</strong>
            </span>
            <span>
              合計買取額:{" "}
              <strong className="text-foreground">
                ¥{totalAmount.toLocaleString()}
              </strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-1.5 pr-3 font-medium">日時</th>
                  <th className="text-left py-1.5 pr-3 font-medium">方法</th>
                  <th className="text-left py-1.5 pr-3 font-medium">担当</th>
                  <th className="text-left py-1.5 pr-3 font-medium">買取品</th>
                  <th className="text-right py-1.5 font-medium">買取額</th>
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 20).map((p) => {
                  const amount = p.acceptedItems?.reduce(
                    (s, i) => s + (i.actualAmount ?? 0),
                    0
                  ) ?? 0;
                  const itemNames = p.acceptedItems
                    ?.slice(0, 3)
                    .map((i) => i.name)
                    .join("、");
                  const extra =
                    (p.acceptedItems?.length ?? 0) > 3
                      ? ` 他${(p.acceptedItems?.length ?? 0) - 3}点`
                      : "";
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border/50 hover:bg-surface-2 transition-colors"
                    >
                      <td className="py-1.5 pr-3 text-muted">
                        {new Date(p.contractedAt).toLocaleDateString("ja-JP", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </td>
                      <td className="py-1.5 pr-3">
                        {METHOD_LABELS[p.methodCode ?? ""] ?? p.methodCode ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3">
                        {p.operator?.name ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3 max-w-[200px] truncate">
                        {itemNames ? `${itemNames}${extra}` : "—"}
                      </td>
                      <td className="py-1.5 text-right font-medium">
                        {amount > 0 ? `¥${amount.toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {projects.length > 20 && (
              <p className="text-xs text-muted text-center pt-2">
                上位20件を表示（全{projects.length}件）
              </p>
            )}
            {projects.length === 0 && (
              <p className="text-xs text-muted text-center py-4">
                この期間の成約案件はありません
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
