// 客観的想定売価（見込金額）の算出コア
//
// 設計:
// - ロバスト統計（外れ値・古い相場を除いた中央値）を相場の中心に据える。
// - 媒体手数料・送料・販売コストを差し引いた「手取り(net)」基準でも算出し、
//   表示相場ではなく実際に会社に残る額で見込金額を評価できるようにする。
// - 信頼度が低い（サンプル僅少・ばらつき大）ときは安全側に割り引く。
//   → 構造的な過大評価バイアスをデータドリブンに抑える。
//
// AI（Anthropic）によるカテゴリ別補正は route 側で行う。ここは決定的な土台を作る。

import type { ShippingType } from "@/lib/types";
import { calculateNetValue } from "@/lib/net-value";
import type { RobustMarketStats, MarketSourceKey } from "./types";

/** 想定売価の算出方針 */
export interface EstimateOptions {
  /**
   * 想定売価係数。相場中央値に対して見込む割合。
   * 既定 0.85（買取後に確実に捌ける水準を想定。属人運用の「70%」より根拠を持たせる）。
   */
  baseRatio?: number;
  /** 出品形態（手取り換算に使用）。既定 "free"（送料込み出品） */
  shipping?: ShippingType;
  /** 手取り基準を主役にするか（既定 false = 表示相場基準を主、手取りは併記） */
  netBased?: boolean;
  /** 商品タイトル（送料サイズ推定に使用） */
  title?: string;
}

/** 算出結果 */
export interface MikomikuEstimate {
  /** 推奨見込金額（円・整数） */
  mikomiku: number;
  /** 相場中心値（ロバスト中央値） */
  marketMedian: number;
  /** 採用した想定売価係数（信頼度補正後） */
  appliedRatio: number;
  /** 信頼度 0..100（統計由来） */
  confidence: number;
  /** 手取り基準の参考値（手数料・送料控除後の中央値） */
  netMedian: number;
  /** 想定売価レンジ（q1〜q3 に係数を適用した目安） */
  range: { low: number; high: number };
  /** 採用媒体の内訳 */
  bySource: { source: MarketSourceKey; count: number; median: number }[];
  /** 算出根拠の説明（人間が読める） */
  rationale: string;
  /** サンプルが不足し信頼できない場合 true */
  lowConfidence: boolean;
}

const DEFAULT_BASE_RATIO = 0.85;
const LOW_CONFIDENCE_THRESHOLD = 40;

/**
 * 信頼度に応じて想定売価係数を補正する。
 * 信頼度が低いほど安全側（低め）に割り引き、過大評価を防ぐ。
 * confidence=100 → 補正なし / confidence=0 → 最大15%下方
 */
function adjustRatioByConfidence(baseRatio: number, confidence: number): number {
  const penalty = (1 - confidence / 100) * 0.15;
  return Math.max(0, baseRatio - penalty);
}

/**
 * ロバスト統計から客観的な見込金額を算出する（決定的）。
 */
export function estimateMikomiku(
  stats: RobustMarketStats,
  options: EstimateOptions = {},
): MikomikuEstimate {
  const baseRatio = options.baseRatio ?? DEFAULT_BASE_RATIO;
  const shipping = options.shipping ?? "free";
  const title = options.title ?? "";

  const appliedRatio = adjustRatioByConfidence(baseRatio, stats.confidence);
  const lowConfidence =
    stats.confidence < LOW_CONFIDENCE_THRESHOLD || stats.effectiveCount < 3;

  // 表示相場の中央値を基準に見込金額
  const marketMedian = stats.median;
  const mikomikuFromDisplay = Math.round(marketMedian * appliedRatio);

  // 手取り基準（手数料・送料・販売コストを控除した中央値）
  let netMedian = marketMedian;
  if (marketMedian > 0 && stats.bySource.length > 0) {
    // 媒体別中央値を件数で加重平均した手取り
    let netSum = 0;
    let weightSum = 0;
    for (const b of stats.bySource) {
      const net = calculateNetValue({
        source: b.source,
        shipping,
        listedPrice: b.median,
        title,
      });
      netSum += net.netValue * b.count;
      weightSum += b.count;
    }
    netMedian = weightSum > 0 ? Math.round(netSum / weightSum) : marketMedian;
  }

  const mikomiku = options.netBased
    ? Math.round(netMedian * appliedRatio)
    : mikomikuFromDisplay;

  // レンジ（q1〜q3 に係数適用）
  const range = {
    low: Math.round(stats.q1 * appliedRatio),
    high: Math.round(stats.q3 * appliedRatio),
  };

  const rationale = buildRationale({
    stats,
    appliedRatio,
    baseRatio,
    marketMedian,
    netMedian,
    mikomiku,
    netBased: options.netBased ?? false,
    lowConfidence,
  });

  return {
    mikomiku,
    marketMedian,
    appliedRatio: Number(appliedRatio.toFixed(3)),
    confidence: stats.confidence,
    netMedian,
    range,
    bySource: stats.bySource,
    rationale,
    lowConfidence,
  };
}

function buildRationale(input: {
  stats: RobustMarketStats;
  appliedRatio: number;
  baseRatio: number;
  marketMedian: number;
  netMedian: number;
  mikomiku: number;
  netBased: boolean;
  lowConfidence: boolean;
}): string {
  const {
    stats,
    appliedRatio,
    baseRatio,
    marketMedian,
    netMedian,
    mikomiku,
    netBased,
    lowConfidence,
  } = input;

  const parts: string[] = [];
  parts.push(
    `有効サンプル${stats.effectiveCount}件（除外前${stats.rawCount}件）のロバスト中央値は${marketMedian.toLocaleString()}円。`,
  );
  if (stats.bySource.length > 0) {
    const srcLabel = stats.bySource
      .map(
        (b) =>
          `${jpSource(b.source)}${b.count}件(中央値${b.median.toLocaleString()}円)`,
      )
      .join("・");
    parts.push(`媒体内訳: ${srcLabel}。`);
  }
  parts.push(
    `手数料・送料控除後の手取り中央値は約${netMedian.toLocaleString()}円。`,
  );
  if (appliedRatio < baseRatio) {
    parts.push(
      `信頼度${stats.confidence}/100のため想定売価係数を基準${(baseRatio * 100).toFixed(0)}%から${(appliedRatio * 100).toFixed(0)}%に下方補正（過大評価の抑制）。`,
    );
  } else {
    parts.push(`想定売価係数${(appliedRatio * 100).toFixed(0)}%を適用。`);
  }
  parts.push(
    `→ 見込金額${mikomiku.toLocaleString()}円（${netBased ? "手取り" : "表示相場"}基準）。`,
  );
  if (lowConfidence) {
    parts.push(
      "⚠ サンプルが少ない/ばらつきが大きいため参考値。査定士の確認を推奨。",
    );
  }
  return parts.join("");
}

function jpSource(source: MarketSourceKey): string {
  return source === "mercari" ? "メルカリ" : "ヤフオク";
}
