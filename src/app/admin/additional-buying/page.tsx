"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Target, Users, TrendingUp, ArrowLeft } from "lucide-react";

interface Summary {
  total: number;
  entry: number;
  additional: number;
  additionalRate: number;
}

interface UserStat {
  userId: string;
  userName: string;
  total: number;
  additional: number;
  additionalRate: number;
}

interface MonthlyStat {
  month: string;
  total: number;
  additional: number;
  additionalRate: number;
}

interface StatsResponse {
  days: number;
  summary: Summary;
  userRanking: UserStat[];
  monthlyTrend: MonthlyStat[];
}

const PERIOD_OPTIONS = [
  { value: 30, label: "30日" },
  { value: 90, label: "90日" },
  { value: 180, label: "180日" },
  { value: 365, label: "365日" },
];

export default function AdditionalBuyingPage() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      await Promise.resolve();
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/additional-stats?days=${days}`, {
          signal: ac.signal,
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? "取得失敗");
        }
        const json = (await res.json()) as StatsResponse;
        setData(json);
      } catch (e: unknown) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "エラー");
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [days]);

  return (
    <AppShell back={{ href: "/admin", label: "管理" }} title="追加買取トラッキング">
      <div className="flex flex-col gap-5">
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Target size={20} className="text-amber-600" />
              追加買取トラッキング
            </h2>
          </div>
          <p className="text-sm text-muted">
            レバー2（追加買取）の数字を可視化
          </p>
        </section>

        {/* 期間選択 */}
        <div className="flex gap-2">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setDays(p.value)}
              className={
                days === p.value
                  ? "text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold"
                  : "text-xs px-3 py-1.5 rounded-lg border border-border text-muted hover:text-foreground"
              }
            >
              直近{p.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-8 text-muted text-sm">
            読み込み中...
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-6 text-danger text-sm">{error}</div>
        )}

        {!loading && !error && data && (
          <>
            {/* サマリーカード */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                サマリー
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Card label="全リスト追加件数" value={`${data.summary.total}件`} />
                <Card
                  label="入口商品"
                  value={`${data.summary.entry}件`}
                  color="text-foreground"
                />
                <Card
                  label="追加買取"
                  value={`${data.summary.additional}件`}
                  color="text-amber-600"
                />
                <Card
                  label="追加買取率"
                  value={`${data.summary.additionalRate}%`}
                  color="text-amber-600"
                  highlight
                />
              </div>
            </section>

            {/* ユーザー別ランキング */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Users size={14} />
                担当者別ランキング（追加買取件数）
              </h3>
              {data.userRanking.length === 0 ? (
                <div className="text-xs text-muted py-4 text-center bg-surface rounded-xl border border-border">
                  データがありません
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-2 text-muted">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">担当者</th>
                        <th className="text-right px-3 py-2 font-medium">追加</th>
                        <th className="text-right px-3 py-2 font-medium">合計</th>
                        <th className="text-right px-3 py-2 font-medium">追加率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.userRanking.map((u, i) => (
                        <tr
                          key={u.userId}
                          className="border-t border-border hover:bg-surface-2"
                        >
                          <td className="px-3 py-2">
                            <span className="text-muted mr-1">#{i + 1}</span>
                            {u.userName}
                          </td>
                          <td className="text-right px-3 py-2 font-semibold text-amber-600">
                            {u.additional}件
                          </td>
                          <td className="text-right px-3 py-2 text-muted">
                            {u.total}件
                          </td>
                          <td className="text-right px-3 py-2 font-semibold">
                            {u.additionalRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 月次推移 */}
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <TrendingUp size={14} />
                月次推移
              </h3>
              {data.monthlyTrend.length === 0 ? (
                <div className="text-xs text-muted py-4 text-center bg-surface rounded-xl border border-border">
                  データがありません
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex flex-col gap-2">
                    {data.monthlyTrend.map((m) => (
                      <div
                        key={m.month}
                        className="flex items-center gap-3"
                      >
                        <div className="text-xs text-muted w-16 shrink-0">
                          {m.month}
                        </div>
                        <div className="flex-1 h-6 bg-surface-2 rounded relative overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 bg-amber-500/40"
                            style={{ width: `${Math.min(m.additionalRate, 100)}%` }}
                          />
                          <div className="absolute inset-0 flex items-center px-2 text-xs">
                            <span className="font-medium">
                              追加{m.additional}/{m.total}件
                            </span>
                            <span className="ml-auto font-semibold text-amber-700 dark:text-amber-400">
                              {m.additionalRate}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* 思想説明 */}
        <section className="text-xs text-muted bg-surface rounded-xl border border-border p-3">
          <p className="font-semibold mb-1">📍 思想</p>
          <p>
            営業 = 利益最大化 × 顧客満足度最大化。レバー2（入口商品以外の追加買取）を可視化し、
            担当者ごとの提案力を数字で支える仕組み。
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function Card({
  label,
  value,
  color = "text-foreground",
  highlight = false,
}: {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-3"
          : "rounded-xl border border-border bg-surface p-3"
      }
    >
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`text-lg font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
