"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Loader2,
  Sparkles,
  Star,
  Target,
  X,
} from "lucide-react";
import {
  saveAdvice,
  removeSavedAdvice,
  searchKeyFromKeyword,
  useAdviceSaved,
  haptic,
} from "@/lib/storage";
import { toast } from "@/lib/toast";
import type { Listing, SourceKey } from "@/lib/types";

type FlatListing = Listing & { source: SourceKey };

type Props = {
  keyword: string;
  productGuess?: string;
  listings: FlatListing[];
};

type AdditionalCategory = {
  category: string;
  reason: string;
  searchKeyword: string;
};

type Advice = {
  summary: string;
  recommendations: { rank: string; price: number; rate: number }[];
  warnings: string[];
  additionalCategories?: AdditionalCategory[];
};

type AdoptionDecision = "accepted" | "rejected";

async function fetchAdvice(
  keyword: string,
  productGuess: string | undefined,
  listings: FlatListing[],
): Promise<Advice> {
  const res = await fetch("/api/ai-advisor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword,
      productGuess,
      listings: listings.map((l) => ({
        source: l.source,
        title: l.title,
        price: l.price,
        condition: l.condition,
        endedAt: l.endedAt,
      })),
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `AI 査定に失敗しました (${res.status})`);
  }
  const data = (await res.json()) as { advice: Advice };
  return data.advice;
}

export function AiAdvisor({ keyword, productGuess, listings }: Props) {
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adoptionByRank, setAdoptionByRank] = useState<
    Record<string, AdoptionDecision>
  >({});
  const [trackingKey, setTrackingKey] = useState<string | null>(null);
  const searchKey = searchKeyFromKeyword(keyword);
  const saved = useAdviceSaved(searchKey);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdvice(keyword, productGuess, listings);
      setAdvice(result);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "AI 査定に失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function toggleSave() {
    if (!advice) return;
    if (saved) {
      removeSavedAdvice(searchKey);
      toast({ message: "保存を解除しました" });
    } else {
      saveAdvice({
        searchKey,
        keyword,
        productGuess,
        summary: advice.summary,
        recommendations: advice.recommendations,
        warnings: advice.warnings,
      });
      toast({
        message: "AI査定を保存しました",
        actionLabel: "履歴で見る",
        actionHref: "/history",
      });
    }
    haptic(8);
  }

  async function trackAdoption(
    recommendation: Advice["recommendations"][number],
    index: number,
    decision: AdoptionDecision,
  ) {
    const key = `${recommendation.rank}:${recommendation.price}`;
    setAdoptionByRank((prev) => ({ ...prev, [key]: decision }));
    setTrackingKey(key);
    try {
      await fetch("/api/ai-advisor/adoption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          productGuess,
          decision,
          listingsCount: listings.length,
          recommendation: {
            ...recommendation,
            index,
          },
        }),
      });
      toast({ message: decision === "accepted" ? "採用を記録しました" : "見送りを記録しました" });
    } catch {
      toast({ message: "記録に失敗しました。画面はそのまま使えます" });
    } finally {
      setTrackingKey(null);
    }
    haptic(8);
  }

  if (listings.length === 0) return null;

  return (
    <section className="bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/20 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">
            AI査定アシスタント
          </span>
          <span className="text-[10px] text-muted px-1.5 py-0.5 rounded bg-surface border border-border">
            β
          </span>
        </div>
        {advice && (
          <button
            type="button"
            onClick={toggleSave}
            aria-label={saved ? "保存を解除" : "アドバイスを保存"}
            className={
              saved
                ? "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold border-2 border-warning bg-warning/10 text-warning"
                : "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border text-muted hover:text-foreground"
            }
          >
            <Star size={12} fill={saved ? "currentColor" : "none"} />
            {saved ? "保存済み" : "保存"}
          </button>
        )}
      </div>

      {!advice && !loading && !error && (
        <>
          <p className="text-xs text-muted leading-relaxed mb-3">
            Claude AIが取引データを分析して、状態別の買取目安と注意点を提案します。
          </p>
          <button
            type="button"
            onClick={run}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 flex items-center justify-center gap-1.5"
          >
            <Sparkles size={14} />
            AI査定を取得
          </button>
        </>
      )}

      {loading && (
        <div className="flex items-center justify-center py-6 gap-2 text-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Claudeが分析中...</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2 text-danger">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed">{error}</p>
          </div>
          <button
            type="button"
            onClick={run}
            className="w-full h-9 rounded-lg border border-border text-foreground text-sm hover:bg-surface-2"
          >
            再試行
          </button>
        </div>
      )}

      {advice && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-[11px] font-semibold text-primary mb-1">
              分析サマリー
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {advice.summary}
            </p>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-primary mb-2">
              買取額の目安（状態別）
            </div>
            <div className="grid grid-cols-2 gap-2">
              {advice.recommendations.map((r, index) => {
                const adoptionKey = `${r.rank}:${r.price}`;
                const currentDecision = adoptionByRank[adoptionKey];
                const isTracking = trackingKey === adoptionKey;
                return (
                <div
                  key={r.rank}
                  className="bg-surface border border-border rounded-lg p-2.5"
                >
                  <div className="text-[10px] text-muted">
                    {r.rank}（{r.rate}%）
                  </div>
                  <div className="text-base font-bold text-foreground mt-0.5">
                    ¥{r.price.toLocaleString("ja-JP")}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    <button
                      type="button"
                      title="この提案額を採用"
                      aria-pressed={currentDecision === "accepted"}
                      disabled={isTracking}
                      onClick={() => trackAdoption(r, index, "accepted")}
                      className={
                        currentDecision === "accepted"
                          ? "h-7 rounded-md bg-success text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1"
                          : "h-7 rounded-md border border-border text-[11px] font-medium text-muted hover:text-foreground inline-flex items-center justify-center gap-1 disabled:opacity-60"
                      }
                    >
                      <Check size={12} />
                      採用
                    </button>
                    <button
                      type="button"
                      title="この提案額を見送り"
                      aria-pressed={currentDecision === "rejected"}
                      disabled={isTracking}
                      onClick={() => trackAdoption(r, index, "rejected")}
                      className={
                        currentDecision === "rejected"
                          ? "h-7 rounded-md bg-muted text-background text-[11px] font-semibold inline-flex items-center justify-center gap-1"
                          : "h-7 rounded-md border border-border text-[11px] font-medium text-muted hover:text-foreground inline-flex items-center justify-center gap-1 disabled:opacity-60"
                      }
                    >
                      <X size={12} />
                      見送り
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-primary mb-1.5">
              注意点
            </div>
            <ul className="flex flex-col gap-1.5">
              {advice.warnings.map((w, i) => (
                <li
                  key={i}
                  className="text-xs text-foreground leading-relaxed pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-warning"
                >
                  {w}
                </li>
              ))}
            </ul>
          </div>

          {/* 思想：レバー2 — 入口商品から推測される追加買取カテゴリ */}
          {advice.additionalCategories && advice.additionalCategories.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Target size={12} className="text-amber-600 dark:text-amber-500" />
                <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  狙うべき追加買取カテゴリ
                </div>
                <span className="text-[10px] text-muted">
                  この顧客に提案すべき商材
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {advice.additionalCategories.map((c, i) => (
                  <div
                    key={`${c.category}-${i}`}
                    className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          {c.category}
                        </div>
                        <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed mt-0.5">
                          {c.reason}
                        </div>
                      </div>
                      <Link
                        href={`/search?keyword=${encodeURIComponent(c.searchKeyword)}`}
                        className="shrink-0 inline-flex items-center gap-0.5 text-[11px] px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/50 font-medium"
                      >
                        相場↗
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={run}
            className="text-xs text-primary hover:underline self-start"
          >
            再分析
          </button>
        </div>
      )}
    </section>
  );
}
