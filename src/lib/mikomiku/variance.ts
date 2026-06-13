// 人間の見込金額 vs AI客観値の差分（過大評価の見える化）
//
// メモリ「AI経営OS / 見込金額算出AI」の中核要件:
// 見込み粗利は「見込金額を高く設定する」心理が構造的に働く（特に新人）。
// AIの客観値と人間の想定値の乖離を可視化し、経営評価（見込み粗利）の歪みを補正する。
//
// ここは純ロジック。査定士の入力値と AI 客観値を受け取り、乖離率・判定を返す。

export type VarianceVerdict =
  | "aligned" // AI客観値と概ね一致（健全）
  | "overvalued" // 人間が過大評価（要補正・最重要シグナル）
  | "undervalued" // 人間が過小評価（取りこぼし／慎重すぎ）
  | "no_reference"; // AI客観値が信頼できず比較不能

export interface VarianceResult {
  /** 査定士が入力した見込金額 */
  humanEstimate: number;
  /** AIの客観的見込金額 */
  aiEstimate: number;
  /** 乖離額（human - ai）。正なら人間が高い */
  deltaAmount: number;
  /** 乖離率（(human - ai) / ai）。正なら人間が高い */
  deltaRatio: number;
  /** 判定 */
  verdict: VarianceVerdict;
  /** 過大評価フラグ（経営評価の補正対象） */
  isOvervalued: boolean;
  /** 人間が読める説明 */
  message: string;
}

/** 過大/過小と判定する乖離率の閾値（既定 ±15%） */
const DEFAULT_TOLERANCE = 0.15;

export interface VarianceOptions {
  /** 許容乖離率（この範囲内なら aligned）。既定 0.15 */
  tolerance?: number;
  /** AI客観値の信頼度が低い場合 true（比較を no_reference にする） */
  aiLowConfidence?: boolean;
}

/**
 * 人間の見込金額と AI 客観値の乖離を算出する。
 */
export function evaluateVariance(
  humanEstimate: number,
  aiEstimate: number,
  options: VarianceOptions = {},
): VarianceResult {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;

  // AI客観値が信頼できない / 0 のときは比較不能
  if (options.aiLowConfidence || aiEstimate <= 0) {
    return {
      humanEstimate,
      aiEstimate,
      deltaAmount: humanEstimate - aiEstimate,
      deltaRatio: 0,
      verdict: "no_reference",
      isOvervalued: false,
      message:
        "AI客観値の信頼度が低いため差分判定は保留。実売サンプルの拡充が必要。",
    };
  }

  const deltaAmount = humanEstimate - aiEstimate;
  const deltaRatio = deltaAmount / aiEstimate;

  let verdict: VarianceVerdict;
  if (deltaRatio > tolerance) {
    verdict = "overvalued";
  } else if (deltaRatio < -tolerance) {
    verdict = "undervalued";
  } else {
    verdict = "aligned";
  }

  const isOvervalued = verdict === "overvalued";
  const pct = (deltaRatio * 100).toFixed(1);

  let message: string;
  switch (verdict) {
    case "overvalued":
      message = `見込金額がAI客観値より${pct}%高い（+${deltaAmount.toLocaleString()}円）。過大評価の可能性。見込み粗利が膨らむため経営評価では補正対象。`;
      break;
    case "undervalued":
      message = `見込金額がAI客観値より${Math.abs(Number(pct))}%低い（${deltaAmount.toLocaleString()}円）。取りこぼし／慎重すぎの可能性。`;
      break;
    case "aligned":
      message = `見込金額はAI客観値と概ね一致（乖離${pct}%）。健全。`;
      break;
    default:
      message = "";
  }

  return {
    humanEstimate,
    aiEstimate,
    deltaAmount,
    deltaRatio: Number(deltaRatio.toFixed(3)),
    verdict,
    isOvervalued,
    message,
  };
}
