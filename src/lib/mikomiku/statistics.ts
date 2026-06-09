// ロバスト相場統計
//
// 単純な median/min/max は外れ値（別商品の混入・ジャンク・新品未開封の高値）や
// 古い相場に弱い。見込金額の土台にするには、
// - 直近期間でフィルタ（古い相場を除外）
// - IQR で外れ値除去
// - トリム平均・ロバスト中央値
// - サンプル数 / ばらつき / 新しさ / 媒体多様性から「信頼度」を算出
// する。これにより属人的な相場読みを、再現可能な客観値に置き換える。

import type {
  SoldSample,
  RobustMarketStats,
  StatsOptions,
  MarketSourceKey,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULTS = {
  recencyWindowDays: 180,
  trimRatio: 0.1,
  iqrFactor: 1.5,
} as const;

/** 昇順ソート済み配列のパーセンタイル（線形補間） */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

function median(sortedAsc: number[]): number {
  return percentile(sortedAsc, 0.5);
}

/** トリム平均（上下 trimRatio を切り落とした平均） */
function trimmedMean(sortedAsc: number[], trimRatio: number): number {
  if (sortedAsc.length === 0) return 0;
  const k = Math.floor(sortedAsc.length * trimRatio);
  const sliced =
    sortedAsc.length - 2 * k >= 1
      ? sortedAsc.slice(k, sortedAsc.length - k)
      : sortedAsc;
  const sum = sliced.reduce((a, b) => a + b, 0);
  return sum / sliced.length;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((a, b) => a + (b - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * 実売価サンプル群からロバストな相場統計を算出する。
 * 純粋関数（now を注入可能）。
 */
export function computeRobustStats(
  samples: SoldSample[],
  options: StatsOptions = {},
): RobustMarketStats {
  const recencyWindowDays =
    options.recencyWindowDays ?? DEFAULTS.recencyWindowDays;
  const trimRatio = options.trimRatio ?? DEFAULTS.trimRatio;
  const iqrFactor = options.iqrFactor ?? DEFAULTS.iqrFactor;
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const windowMs = recencyWindowDays * DAY_MS;

  const rawCount = samples.length;

  // 価格が正の有効サンプルのみ
  const valid = samples.filter(
    (s) => typeof s.price === "number" && s.price > 0,
  );

  // 1) 直近期間フィルタ（soldAt が不正なものは残す = 日付不明でも捨てない）
  const withinWindow = valid.filter((s) => {
    const t = Date.parse(s.soldAt);
    if (Number.isNaN(t)) return true;
    return nowMs - t <= windowMs;
  });

  // 期間フィルタで全滅する場合は期間を無視（古くてもサンプルは活かす）
  const periodScoped = withinWindow.length > 0 ? withinWindow : valid;

  // 2) IQR 外れ値除去
  const pricesForIqr = periodScoped.map((s) => s.price).sort((a, b) => a - b);
  const q1 = percentile(pricesForIqr, 0.25);
  const q3 = percentile(pricesForIqr, 0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - iqrFactor * iqr;
  const upperBound = q3 + iqrFactor * iqr;

  const effective =
    pricesForIqr.length >= 4
      ? periodScoped.filter(
          (s) => s.price >= lowerBound && s.price <= upperBound,
        )
      : periodScoped; // サンプルが少なすぎる時は除去しない

  const effPricesAsc = effective.map((s) => s.price).sort((a, b) => a - b);
  const effectiveCount = effPricesAsc.length;

  if (effectiveCount === 0) {
    return emptyStats(rawCount);
  }

  const med = median(effPricesAsc);
  const tMean = trimmedMean(effPricesAsc, trimRatio);
  const avg = mean(effPricesAsc);
  const sd = stddev(effPricesAsc, avg);
  const cv = avg > 0 ? sd / avg : 0;

  // 媒体別内訳
  const bySource = computeBySource(effective);

  // 新しさ: 有効サンプルのうち直近30日の割合
  const recentMs = 30 * DAY_MS;
  const recentCount = effective.filter((s) => {
    const t = Date.parse(s.soldAt);
    if (Number.isNaN(t)) return false;
    return nowMs - t <= recentMs;
  }).length;
  const recencyRatio = effectiveCount > 0 ? recentCount / effectiveCount : 0;

  const confidence = computeConfidence({
    effectiveCount,
    cv,
    recencyRatio,
    sourceVariety: bySource.length,
  });

  return {
    effectiveCount,
    rawCount,
    median: Math.round(med),
    trimmedMean: Math.round(tMean),
    min: effPricesAsc[0],
    max: effPricesAsc[effPricesAsc.length - 1],
    q1: Math.round(q1),
    q3: Math.round(q3),
    coefficientOfVariation: Number(cv.toFixed(3)),
    bySource,
    recencyRatio: Number(recencyRatio.toFixed(3)),
    confidence,
  };
}

function computeBySource(
  samples: SoldSample[],
): RobustMarketStats["bySource"] {
  const map = new Map<MarketSourceKey, number[]>();
  for (const s of samples) {
    const arr = map.get(s.source) ?? [];
    arr.push(s.price);
    map.set(s.source, arr);
  }
  const out: RobustMarketStats["bySource"] = [];
  for (const [source, prices] of map) {
    const asc = [...prices].sort((a, b) => a - b);
    out.push({ source, count: asc.length, median: Math.round(median(asc)) });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

/**
 * 信頼度スコア 0..100。
 * - サンプル数: 多いほど高い（飽和カーブ）
 * - ばらつき(CV): 小さいほど高い
 * - 新しさ: 直近サンプルが多いほど高い
 * - 媒体多様性: 2媒体揃うと加点
 */
function computeConfidence(input: {
  effectiveCount: number;
  cv: number;
  recencyRatio: number;
  sourceVariety: number;
}): number {
  const { effectiveCount, cv, recencyRatio, sourceVariety } = input;

  // サンプル数スコア（0..1）。12件で約0.63、30件で約0.92に飽和
  const countScore = 1 - Math.exp(-effectiveCount / 12);

  // ばらつきスコア（0..1）。CV=0で1、CV=0.6付近で0付近
  const cvScore = Math.max(0, 1 - cv / 0.6);

  // 新しさスコア（0..1）
  const recencyScore = recencyRatio;

  // 媒体多様性（0..1）
  const varietyScore = sourceVariety >= 2 ? 1 : 0.5;

  // 重み付け（サンプル数とばらつきを重視）
  const score =
    countScore * 0.4 +
    cvScore * 0.3 +
    recencyScore * 0.15 +
    varietyScore * 0.15;

  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

function emptyStats(rawCount: number): RobustMarketStats {
  return {
    effectiveCount: 0,
    rawCount,
    median: 0,
    trimmedMean: 0,
    min: 0,
    max: 0,
    q1: 0,
    q3: 0,
    coefficientOfVariation: 0,
    bySource: [],
    recencyRatio: 0,
    confidence: 0,
  };
}
