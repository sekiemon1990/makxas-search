"use client";

// 想定売価チェック（差分可視化UI）
//
// 査定士の想定売価と、AIの客観値（ヤフオク・メルカリの実売データ由来）を
// 並べて表示し、ズレを信号色で見せる。過大評価をその場で気づかせ、
// 経営評価（見込み粗利）の歪みを抑制するためのコンポーネント。

import { useState } from "react";
import type { MikomikuEstimate } from "@/lib/mikomiku/estimate";
import type { VarianceResult, VarianceVerdict } from "@/lib/mikomiku/variance";
import type { MarketSourceKey } from "@/lib/mikomiku/types";

type MikomikuVarianceProps = {
  /** AI客観値（信頼度・レンジ・媒体内訳・根拠を含む） */
  estimate: MikomikuEstimate;
  /** 査定士想定値との差分判定（想定値未入力なら null） */
  variance: VarianceResult | null;
  /** 有効/除外サンプル数（根拠表示用・任意） */
  sampleInfo?: { effectiveCount: number; rawCount: number };
};

const VERDICT_STYLE: Record<
  VarianceVerdict,
  { label: string; icon: string; badge: string; text: string }
> = {
  overvalued: {
    label: "過大評価の可能性",
    icon: "🔴",
    badge: "bg-red-100 text-red-700 ring-red-600/20",
    text: "text-red-700",
  },
  undervalued: {
    label: "過小評価の可能性",
    icon: "🟡",
    badge: "bg-amber-100 text-amber-700 ring-amber-600/20",
    text: "text-amber-700",
  },
  aligned: {
    label: "想定は健全",
    icon: "🟢",
    badge: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
    text: "text-emerald-700",
  },
  no_reference: {
    label: "判定保留",
    icon: "⚪",
    badge: "bg-gray-100 text-gray-600 ring-gray-500/20",
    text: "text-gray-600",
  },
};

const SOURCE_LABEL: Record<MarketSourceKey, string> = {
  mercari: "メルカリ",
  yahoo_auction: "ヤフオク",
};

function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString()}`;
}

/** 信頼度メーター（5ドット） */
function ConfidenceMeter({ confidence }: { confidence: number }) {
  const filled = Math.round((confidence / 100) * 5);
  const color =
    confidence >= 70
      ? "bg-emerald-500"
      : confidence >= 40
        ? "bg-amber-500"
        : "bg-gray-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-3 rounded-sm ${i < filled ? color : "bg-gray-200"}`}
          />
        ))}
      </div>
      <span className="text-[11px] text-gray-500">信頼度 {confidence}</span>
    </div>
  );
}

export function MikomikuVariance({
  estimate,
  variance,
  sampleInfo,
}: MikomikuVarianceProps) {
  const [showRationale, setShowRationale] = useState(false);

  // variance が無い（想定値未入力）場合は判定保留相当の中立表示にフォールバック
  const verdict: VarianceVerdict = variance?.verdict ?? "no_reference";
  const style = VERDICT_STYLE[verdict];
  const deltaRatioPct = variance ? (variance.deltaRatio * 100).toFixed(1) : null;
  const deltaSign = variance && variance.deltaAmount > 0 ? "+" : "";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">想定売価チェック</h3>
        <span className="text-[11px] text-gray-400">
          実売データ（ヤフオク・メルカリ）由来
        </span>
      </div>

      {/* 2カラム: 査定士想定値 vs AI客観値 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-[11px] font-medium text-gray-500">
            査定士の想定売価
          </p>
          <p className="mt-1 text-xl font-bold text-gray-800">
            {variance ? yen(variance.humanEstimate) : "—"}
          </p>
        </div>
        <div className="rounded-lg bg-indigo-50 p-3">
          <p className="text-[11px] font-medium text-indigo-500">AIの客観値</p>
          <p className="mt-1 text-xl font-bold text-indigo-700">
            {yen(estimate.mikomiku)}
          </p>
          <div className="mt-1.5">
            <ConfidenceMeter confidence={estimate.confidence} />
          </div>
        </div>
      </div>

      {/* 判定バッジ + 乖離 */}
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${style.badge}`}
          >
            {style.icon} {style.label}
          </span>
          {variance && verdict !== "no_reference" && (
            <span className={`text-xs font-semibold ${style.text}`}>
              {deltaSign}
              {yen(Math.abs(variance.deltaAmount))} / {deltaSign}
              {deltaRatioPct}%
            </span>
          )}
        </div>
        {variance && (
          <p className="mt-1.5 border-l-2 border-gray-200 pl-2 text-xs leading-relaxed text-gray-600">
            {variance.message}
          </p>
        )}
        {!variance && (
          <p className="mt-1.5 text-xs text-gray-500">
            想定売価を入力すると、AI客観値とのズレを判定します。
          </p>
        )}
      </div>

      {/* 想定レンジ + 手取り基準 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        <span>想定レンジ</span>
        <span className="font-medium text-gray-700">
          {yen(estimate.range.low)} 〜 {yen(estimate.range.high)}
        </span>
        <span className="text-gray-300">|</span>
        <span>手取り基準</span>
        <span className="font-medium text-gray-700">
          {yen(estimate.netMedian)}
        </span>
      </div>

      {/* 根拠（折りたたみ） */}
      <button
        type="button"
        onClick={() => setShowRationale((v) => !v)}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
      >
        <span>{showRationale ? "▾" : "▸"}</span> 根拠を見る
      </button>
      {showRationale && (
        <div className="mt-2 rounded-lg bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-600">
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
            {estimate.bySource.map((b) => (
              <span key={b.source} className="text-gray-700">
                {SOURCE_LABEL[b.source]}{" "}
                <span className="font-semibold">{b.count}件</span>（中央値{" "}
                {yen(b.median)}）
              </span>
            ))}
            {sampleInfo && (
              <span className="text-gray-500">
                外れ値 {sampleInfo.rawCount - sampleInfo.effectiveCount} 件除外 ／
                有効 {sampleInfo.effectiveCount} 件
              </span>
            )}
          </div>
          <p>{estimate.rationale}</p>
        </div>
      )}
    </div>
  );
}
