"use client";

import { useState } from "react";
import Link from "next/link";
import {
  type Motivation,
  type AgeGroup,
  type RankedSuggestItem,
  MOTIVATION_LABELS,
  AGE_LABELS,
  MOTIVATION_TO_BACKGROUND_CODE,
  getSuggestions,
} from "@/lib/suggest/data";
import { RealDataPanel } from "./RealDataPanel";

const PRIORITY_COLORS: Record<number, string> = {
  4: "bg-red-100 text-red-700 border-red-200",
  3: "bg-orange-100 text-orange-700 border-orange-200",
  2: "bg-yellow-100 text-yellow-700 border-yellow-200",
  1: "bg-surface-2 text-muted border-border",
};

const PRIORITY_STARS = (score: number) => {
  const s = Math.ceil(score);
  return "★".repeat(Math.min(s, 4)) + "☆".repeat(Math.max(4 - s, 0));
};

export function CustomerSuggester() {
  const [motivation, setMotivation] = useState<Motivation | null>(null);
  const [age, setAge] = useState<AgeGroup | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const suggestions: RankedSuggestItem[] =
    motivation && age ? getSuggestions(age, motivation) : [];

  const toggleCheck = (category: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const reset = () => {
    setMotivation(null);
    setAge(null);
    setChecked(new Set());
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── 売却動機 ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-2">
          売却動機を選択
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(MOTIVATION_LABELS) as Motivation[]).map((m) => {
            const info = MOTIVATION_LABELS[m];
            const active = motivation === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMotivation(m)}
                className={`tap-scale text-left px-3 py-3 rounded-xl border-2 transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface hover:border-primary/40"
                }`}
              >
                <div className="text-xl mb-0.5">{info.emoji}</div>
                <div className="text-sm font-semibold">{info.label}</div>
                <div className="text-xs text-muted mt-0.5">{info.sub}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 年齢層 ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-2">
          顧客の年齢層
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(AGE_LABELS) as AgeGroup[]).map((a) => {
            const info = AGE_LABELS[a];
            const active = age === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => setAge(a)}
                className={`tap-scale text-left px-3 py-2.5 rounded-xl border-2 transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface hover:border-primary/40"
                }`}
              >
                <div className="text-sm font-semibold">{info.label}</div>
                <div className="text-xs text-muted mt-0.5">{info.sub}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 結果 ── */}
      {suggestions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">
              追加提案商材（優先度順）
            </h3>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-muted hover:text-foreground"
            >
              リセット
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {suggestions.map((item) => {
              const isChecked = checked.has(item.category);
              const priorityClass =
                PRIORITY_COLORS[Math.min(Math.ceil(item.score), 4)] ??
                PRIORITY_COLORS[1];

              return (
                <div
                  key={item.category}
                  className={`rounded-xl border p-3 transition-opacity ${
                    isChecked ? "opacity-50" : ""
                  } ${priorityClass}`}
                >
                  <div className="flex items-start gap-3">
                    {/* チェックボックス */}
                    <button
                      type="button"
                      onClick={() => toggleCheck(item.category)}
                      className="mt-0.5 w-5 h-5 rounded border-2 border-current flex items-center justify-center shrink-0"
                      aria-label={isChecked ? "未確認に戻す" : "確認済みにする"}
                    >
                      {isChecked && (
                        <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3">
                          <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg leading-none">{item.icon}</span>
                        <span className="text-sm font-semibold">{item.category}</span>
                        <span className="text-xs opacity-70 font-mono tracking-wider">
                          {PRIORITY_STARS(item.score)}
                        </span>
                        <span className="text-xs opacity-70">
                          ¥{item.minPrice.toLocaleString()}〜
                        </span>
                      </div>
                      <div className="text-xs opacity-80 mt-1">
                        {item.examples.join("・")}
                      </div>
                      <div className="text-xs mt-1.5 italic opacity-90 leading-relaxed">
                        「{item.prompt}」
                      </div>
                    </div>

                    {/* 相場検索リンク */}
                    <Link
                      href={`/search?keyword=${encodeURIComponent(item.searchKeyword)}`}
                      className="shrink-0 tap-scale text-xs px-2 py-1 rounded-lg bg-background/60 hover:bg-background border border-current/20 font-medium"
                    >
                      相場↗
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* チェック進捗 */}
          <div className="mt-3 text-xs text-muted text-right">
            確認済み {checked.size} / {suggestions.length} 商材
          </div>
        </section>
      )}

      {/* 過去実成約データ（動機が選択されたら表示） */}
      {motivation && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            実データで検証
          </h3>
          <RealDataPanel
            filterBackgroundCode={MOTIVATION_TO_BACKGROUND_CODE[motivation][0]}
            days={90}
          />
          <p className="text-xs text-muted mt-1.5">
            ※ core-rails の成約案件を集計。本番環境では staging core-rails 接続後に表示。
          </p>
        </section>
      )}

      {/* 未選択時のガイド */}
      {!motivation && !age && (
        <div className="text-center py-8 text-muted text-sm">
          売却動機と年齢層を選択すると<br />
          追加提案商材が優先度順に表示されます
        </div>
      )}
      {(motivation || age) && suggestions.length === 0 && (
        <div className="text-center py-6 text-muted text-sm">
          両方選択すると提案が表示されます
        </div>
      )}
    </div>
  );
}
