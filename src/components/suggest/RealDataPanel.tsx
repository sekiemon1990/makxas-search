"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BackgroundCodeStats } from "@/lib/core-rails/aggregate";

interface Props {
  // backgroundCode を絞り込む（指定なしなら全部表示）
  filterBackgroundCode?: string;
  days?: number;
}

interface StatsResponse {
  days: number;
  totalProjects: number;
  stats: BackgroundCodeStats[];
}

export function RealDataPanel({
  filterBackgroundCode,
  days = 90,
}: Props) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      await Promise.resolve();
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/core-rails/item-stats?days=${days}`, {
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

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted text-center">
        過去の成約データを読み込み中...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
        実データは現在取得できません（{error}）
      </div>
    );
  }
  if (!data || data.totalProjects === 0) {
    return null;
  }

  const filteredStats = filterBackgroundCode
    ? data.stats.filter((s) => s.backgroundCode === filterBackgroundCode)
    : data.stats;

  // フィルタしてもヒットがない場合は、全体上位カテゴリだけ表示
  const showStats = filteredStats.length > 0 ? filteredStats : data.stats.slice(0, 1);

  return (
    <div className="rounded-xl border-2 border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/20 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">📊</span>
        <span className="text-xs font-semibold text-sky-800 dark:text-sky-300">
          過去の実成約データ（直近{data.days}日）
        </span>
        <span className="text-xs text-sky-600 dark:text-sky-500 ml-1">
          全{data.totalProjects}件
        </span>
      </div>

      {showStats.map((s) => {
        const topCategories = s.categories
          .filter((c) => c.category !== "その他")
          .slice(0, 5);
        return (
          <div key={s.backgroundCode} className="mb-3 last:mb-0">
            <div className="text-xs text-sky-700 dark:text-sky-400 mb-1.5">
              <span className="font-medium">{s.backgroundCode}</span>
              <span className="ml-2 opacity-70">
                {s.projectCount}件・合計¥{s.totalAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {topCategories.map((c) => (
                <div
                  key={c.category}
                  className="flex items-center justify-between text-xs bg-white/60 dark:bg-sky-900/30 rounded px-2 py-1.5"
                >
                  <span className="font-medium">{c.category}</span>
                  <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300">
                    <span>{c.projectCount}件中{c.count}点</span>
                    <span className="font-semibold">
                      平均¥{c.avgAmount.toLocaleString()}
                    </span>
                    <Link
                      href={`/search?keyword=${encodeURIComponent(c.category)}`}
                      className="text-sky-500 hover:text-sky-700 dark:hover:text-sky-200"
                      title={`${c.category}の相場を検索`}
                    >
                      ↗
                    </Link>
                  </div>
                </div>
              ))}
              {topCategories.length === 0 && (
                <div className="text-xs text-muted">
                  カテゴリ判定できる商品がありません
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
