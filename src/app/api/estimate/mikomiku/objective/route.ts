// 見込金額算出AI — 客観値パイプライン
//
// 既存 /api/estimate/mikomiku（クライアントが渡した median を係数で割るだけ）の進化版。
// このエンドポイントは「ヤフオク・メルカリAPI連携」で実売価をサーバ側取得し、
//   実売価取得 → ロバスト統計 → 客観的見込金額 → (人間想定値との差分)
// まで一気通貫で算出する。属人性・過大評価バイアスをデータドリブンに排除する。

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { defaultMarketProvider } from "@/lib/mikomiku/market-price";
import { computeRobustStats } from "@/lib/mikomiku/statistics";
import { estimateMikomiku } from "@/lib/mikomiku/estimate";
import { evaluateVariance } from "@/lib/mikomiku/variance";
import type { SoldSample, MarketSamples } from "@/lib/mikomiku/types";
import type { ShippingType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type RequestBody = {
  /** 商品キーワード（必須） */
  keyword?: string;
  /** 除外キーワード（部品取り・ジャンク混入の除去） */
  excludes?: string;
  /** 査定士が入力した見込金額（あれば差分=過大評価判定を返す） */
  humanEstimate?: number;
  /** 出品形態（手取り換算用）。既定 "free" */
  shipping?: ShippingType;
  /** 手取り基準で見込金額を出すか。既定 false（表示相場基準） */
  netBased?: boolean;
  /** 見込金額係数の上書き（既定 0.85） */
  baseRatio?: number;
  /** 媒体ごとの取得上限。既定 60 */
  limitPerSource?: number;
};

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "mikomiku-objective", 20);
  if (limited) return limited;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const keyword = body.keyword?.trim();
  if (!keyword) {
    return NextResponse.json({ error: "keyword は必須です" }, { status: 400 });
  }

  // 1) 実売価データソース（ヤフオク・メルカリAPI連携）からサンプル取得
  let samples: SoldSample[];
  let perSource: MarketSamples["perSource"];
  try {
    const result = await defaultMarketProvider.fetchSoldSamples({
      keyword,
      excludes: body.excludes?.trim() || undefined,
      limitPerSource: body.limitPerSource,
    });
    samples = result.samples;
    perSource = result.perSource;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[mikomiku-objective] fetch error:", msg);
    return NextResponse.json(
      { error: "実売価データの取得に失敗しました", detail: msg },
      { status: 502 },
    );
  }

  // 2) ロバスト統計
  const stats = computeRobustStats(samples);

  // サンプルゼロ＝相場が立たない
  if (stats.effectiveCount === 0) {
    return NextResponse.json({
      keyword,
      estimate: null,
      stats,
      perSource,
      message:
        "実売サンプルが取得できませんでした。キーワードを変えるか手動査定が必要です。",
    });
  }

  // 3) 客観的見込金額
  const estimate = estimateMikomiku(stats, {
    baseRatio: body.baseRatio,
    shipping: body.shipping,
    netBased: body.netBased,
    title: keyword,
  });

  // 4) 人間想定値との差分（過大評価の見える化・経営評価適正化）
  const variance =
    typeof body.humanEstimate === "number" && body.humanEstimate >= 0
      ? evaluateVariance(body.humanEstimate, estimate.mikomiku, {
          aiLowConfidence: estimate.lowConfidence,
        })
      : null;

  return NextResponse.json({
    keyword,
    estimate,
    stats,
    perSource,
    variance,
  });
}
