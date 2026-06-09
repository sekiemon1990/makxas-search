// 実売価データソース（ヤフオク・メルカリAPI連携）の抽象レイヤ
//
// 「ヤフオク・メルカリAPI連携」を MarketPriceProvider 越しに扱う。
// 現状の実装は既存スクレイパ（ヤフオク closedsearch / メルカリ内部API + DPoP）を
// アダプタ化したもの。将来 公式API・正規データ提携に切り替える際は、
// この Provider 実装を差し替えるだけで上位（統計・見込算出）は無変更で済む。
//
// 実売価として採用するのは「成約価格が取れる媒体」= ヤフオク(落札) / メルカリ(売切) のみ。
// ジモティーは "出品中" で成約価格ではないため、実売価サンプルから除外する。

import type { Listing, SourceResult } from "@/lib/types";
import { scrapeMercari } from "@/lib/scrapers/mercari";
import { scrapeYahooAuction } from "@/lib/scrapers/yahoo";
import { createLogger } from "@/lib/logger";
import type {
  MarketPriceProvider,
  MarketQuery,
  MarketSamples,
  MarketSourceKey,
  SoldSample,
} from "./types";

const log = createLogger("mikomiku-market");

const ALL_SOURCES: MarketSourceKey[] = ["mercari", "yahoo_auction"];
const DEFAULT_LIMIT_PER_SOURCE = 60;

/** Listing → SoldSample 正規化 */
function toSoldSample(
  source: MarketSourceKey,
  listing: Listing,
): SoldSample | null {
  if (typeof listing.price !== "number" || listing.price <= 0) return null;
  return {
    source,
    price: listing.price,
    soldAt: listing.endedAt,
    title: listing.title,
    condition: listing.condition,
    url: listing.url,
  };
}

function listingsToSamples(
  source: MarketSourceKey,
  result: SourceResult,
): SoldSample[] {
  return result.listings
    .map((l) => toSoldSample(source, l))
    .filter((s): s is SoldSample => s !== null);
}

/**
 * 既存スクレイパをアダプタ化した Provider。
 * ヤフオク・メルカリの成約データを並列取得し、SoldSample に正規化して返す。
 */
export class ScraperMarketProvider implements MarketPriceProvider {
  readonly name = "scraper-yahoo-mercari";

  async fetchSoldSamples(query: MarketQuery): Promise<MarketSamples> {
    const sources = query.sources ?? ALL_SOURCES;
    const limit = query.limitPerSource ?? DEFAULT_LIMIT_PER_SOURCE;

    const tasks = sources.map((source) =>
      this.fetchOne(source, query.keyword, query.excludes, limit),
    );
    const settled = await Promise.all(tasks);

    const samples: SoldSample[] = [];
    const perSource: MarketSamples["perSource"] = [];

    for (const r of settled) {
      perSource.push({
        source: r.source,
        fetched: r.samples.length,
        totalAvailable: r.totalAvailable,
        error: r.error,
      });
      samples.push(...r.samples);
    }

    return { query, samples, perSource };
  }

  private async fetchOne(
    source: MarketSourceKey,
    keyword: string,
    excludes: string | undefined,
    limit: number,
  ): Promise<{
    source: MarketSourceKey;
    samples: SoldSample[];
    totalAvailable?: number;
    error?: string;
  }> {
    try {
      let result: SourceResult;
      if (source === "mercari") {
        result = await scrapeMercari({
          keyword,
          excludes,
          limit,
          status: "sold",
        });
      } else {
        result = await scrapeYahooAuction({
          keyword,
          excludes,
          limit,
          status: "sold",
        });
      }
      return {
        source,
        samples: listingsToSamples(source, result),
        totalAvailable: result.totalAvailable,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`fetch ${source} failed:`, msg);
      return { source, samples: [], error: msg };
    }
  }
}

/** 既定の Provider インスタンス（呼び出し側はこれを使う） */
export const defaultMarketProvider: MarketPriceProvider =
  new ScraperMarketProvider();
