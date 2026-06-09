// 見込金額（想定売価）算出AIの共通型
//
// 設計思想（AI経営OS / 見込金額算出AI）:
// - 実売価データソースは「ヤフオク・メルカリAPI連携」を前提に抽象化する
//   （現状は内部API/DPoP 連携、将来は公式API/正規データ提携へ差し替え可能）。
// - 属人的な相場勘を、実売実績データに置き換える（客観的想定売価）。
// - 過大評価バイアス（見込み粗利を高く見積もる心理）をデータドリブンで補正する。

import type { SourceKey } from "@/lib/types";

/** 実売価として採用する媒体（成約価格が取れるもののみ） */
export type MarketSourceKey = Extract<SourceKey, "yahoo_auction" | "mercari">;

/**
 * 1件の実売価サンプル（落札済 / 売切）。
 * Provider が媒体ごとの生データを正規化したもの。
 */
export interface SoldSample {
  /** 媒体 */
  source: MarketSourceKey;
  /** 実売価（円・税送料込みの表示成約価格） */
  price: number;
  /** 成約日時（ISO文字列）。古い相場の重み付け・除外に使う */
  soldAt: string;
  /** 元の出品タイトル（外れ値・別商品混入の判定に使う） */
  title: string;
  /** 商品状態（任意） */
  condition?: string;
  /** 元リンク（監査・トレース用） */
  url?: string;
}

/** 実売価データソース Provider への問い合わせ条件 */
export interface MarketQuery {
  /** 検索キーワード（商品名） */
  keyword: string;
  /** 除外キーワード（部品取り・ジャンク等の混入除去） */
  excludes?: string;
  /** 媒体ごとの取得上限件数 */
  limitPerSource?: number;
  /** 対象媒体（省略時は全媒体） */
  sources?: MarketSourceKey[];
}

/** Provider が返す実売価サンプル集（媒体横断） */
export interface MarketSamples {
  query: MarketQuery;
  samples: SoldSample[];
  /** 媒体別の取得件数・エラー有無 */
  perSource: {
    source: MarketSourceKey;
    fetched: number;
    /** 媒体側に存在する総件数（取得は表示分のみ） */
    totalAvailable?: number;
    error?: string;
  }[];
}

/**
 * 実売価データソースの抽象。
 * 「ヤフオク・メルカリAPI連携」をこのインターフェース越しに扱い、
 * 実装（スクレイパ/公式API）を呼び出し側から隠蔽する。
 */
export interface MarketPriceProvider {
  readonly name: string;
  fetchSoldSamples(query: MarketQuery): Promise<MarketSamples>;
}

/** ロバスト統計の結果 */
export interface RobustMarketStats {
  /** 統計に使った有効サンプル数（外れ値・期間除外後） */
  effectiveCount: number;
  /** 除外前の総サンプル数 */
  rawCount: number;
  /** ロバスト中央値（外れ値除去後） */
  median: number;
  /** トリム平均（上下を切り落とした平均） */
  trimmedMean: number;
  /** 有効サンプルの最小・最大 */
  min: number;
  max: number;
  /** 第1四分位・第3四分位 */
  q1: number;
  q3: number;
  /** 変動係数（標準偏差/平均）。価格のばらつき指標 */
  coefficientOfVariation: number;
  /** 媒体別の内訳 */
  bySource: {
    source: MarketSourceKey;
    count: number;
    median: number;
  }[];
  /** 直近サンプルの割合（新しさの指標 0..1） */
  recencyRatio: number;
  /**
   * 信頼度スコア 0..100。
   * サンプル数・ばらつき・新しさ・媒体多様性から算出。
   * 見込金額の確信度として UI / 経営評価に使う。
   */
  confidence: number;
}

/** 統計算出のオプション */
export interface StatsOptions {
  /** この日数より古いサンプルは除外（既定 180日） */
  recencyWindowDays?: number;
  /** トリム平均で上下を切る割合（既定 0.1 = 上下10%） */
  trimRatio?: number;
  /** IQR外れ値除去の係数（既定 1.5） */
  iqrFactor?: number;
  /** 統計の基準時刻（テスト用に注入可能、既定は実行時刻） */
  now?: Date;
}
