"use client";

import { AppShell } from "@/components/AppShell";
import { ShieldCheck, TrendingDown, TrendingUp, Minus, ExternalLink } from "lucide-react";

// ─────────────────────────────────────────────
// デモ用データ
// ─────────────────────────────────────────────

const DEMO = {
  keyword: "Sony α7III ボディ",
  soldCount: 23,
  period: "過去90日",
  priceMin: 48000,
  priceMax: 78000,
  priceAvg: 61200,
  examples: [
    { title: "SONY α7III ボディ 美品 シャッター数少", price: 71000, condition: "良好", soldAt: "3日前", source: "ヤフオク" },
    { title: "ソニー α7 III 本体 付属品完備", price: 68000, condition: "良好", soldAt: "5日前", source: "メルカリ" },
    { title: "Sony α7III 動作確認済み", price: 65000, condition: "普通", soldAt: "8日前", source: "ヤフオク" },
    { title: "α7III ボディのみ 使用感あり", price: 55000, condition: "やや傷あり", soldAt: "12日前", source: "メルカリ" },
    { title: "SONY α7III ジャンク 部品取り", price: 32000, condition: "難あり", soldAt: "15日前", source: "ヤフオク" },
  ],
};

function formatPrice(n: number) {
  return n.toLocaleString("ja-JP");
}

function ConditionBadge({ condition }: { condition: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    良好: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
    普通: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
    "やや傷あり": { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
    難あり: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
  };
  const style = map[condition] ?? { bg: "bg-surface-2", text: "text-muted" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
      {condition}
    </span>
  );
}

export default function CustomerPage() {
  return (
    <AppShell title="買取価格のご説明">
      <div className="flex flex-col gap-5">
        {/* ヘッダー */}
        <section className="text-center pt-2">
          <div className="flex items-center justify-center gap-2 text-primary mb-2">
            <ShieldCheck size={20} />
            <span className="text-sm font-semibold">根拠のある価格でご説明</span>
          </div>
          <h2 className="text-lg font-bold text-foreground leading-snug">{DEMO.keyword}</h2>
          <p className="text-xs text-muted mt-1">
            {DEMO.period}の{DEMO.soldCount}件の実際の取引価格をもとに算出しています
          </p>
        </section>

        {/* 価格サマリー */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col gap-3">
          <div className="text-center">
            <p className="text-xs text-muted mb-1">市場での取引価格帯</p>
            <p className="text-3xl font-bold text-primary">
              ¥{formatPrice(DEMO.priceMin)}
              <span className="text-xl mx-1 text-muted">〜</span>
              ¥{formatPrice(DEMO.priceMax)}
            </p>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1"><TrendingDown size={12} className="text-blue-400" />最安 ¥{formatPrice(DEMO.priceMin)}</span>
            <span className="flex items-center gap-1"><Minus size={12} className="text-primary" />平均 ¥{formatPrice(DEMO.priceAvg)}</span>
            <span className="flex items-center gap-1"><TrendingUp size={12} className="text-green-400" />最高 ¥{formatPrice(DEMO.priceMax)}</span>
          </div>
        </div>

        {/* 実際の取引例 */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            実際の取引例（難あり品を除く）
          </h3>
          <div className="flex flex-col gap-2">
            {DEMO.examples
              .filter((e) => e.condition !== "難あり")
              .map((ex, i) => (
                <div
                  key={i}
                  className="bg-surface border border-border rounded-xl p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{ex.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <ConditionBadge condition={ex.condition} />
                      <span className="text-xs text-muted">{ex.source} · {ex.soldAt}</span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-foreground shrink-0">
                    ¥{formatPrice(ex.price)}
                  </p>
                </div>
              ))}
          </div>
        </section>

        {/* 補足説明 */}
        <div className="bg-surface-2 rounded-xl p-4 text-xs text-muted leading-relaxed flex flex-col gap-1.5">
          <p className="font-semibold text-foreground text-sm">買取価格について</p>
          <p>・ 上記は消費者間の取引価格です。買取価格には販売コスト・利益が含まれます。</p>
          <p>・ お品物の状態・付属品の有無によって変動します。</p>
          <p>・ 相場は日々変動します。本日時点の価格です。</p>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 text-xs text-yellow-800 dark:text-yellow-300">
          ⚠️ これはデモ画面です。実際の機能は開発中です。
        </div>
      </div>
    </AppShell>
  );
}
