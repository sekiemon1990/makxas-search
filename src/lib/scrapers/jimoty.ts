import * as cheerio from "cheerio";
import type { Listing, SourceResult } from "@/lib/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("jimoty-scrape");

/**
 * ジモティー (jmty.jp) スクレイパ v2
 *
 * 確認済みHTML構造 (2026-05):
 *   <li class="p-articles-list-item">
 *     <div class="p-item-image-component">
 *       <a href="https://jmty.jp/.../article-XXXX"><img src="..." alt="タイトル" /></a>
 *     </div>
 *     <div class="p-item-content-info">
 *       <div class="p-item-title">
 *         <a href="https://jmty.jp/.../article-XXXX">タイトル</a>
 *       </div>
 *       <div class="p-item-important-field">
 *         <div class="p-item-most-important"><b>300円</b></div>   ← 価格
 *         <div class="p-item-secondary-important"><a>東京都</a></div>  ← 所在地
 *       </div>
 *       <div class="p-item-history">更新5月4日 作成5月3日</div>
 *     </div>
 *   </li>
 *
 * 注意: ジモティーは「売買成立済み (sold)」フィルタが存在しない。
 *       掲載中のアクセス価格 (希望売値) を取得しているため、
 *       ヤフオク落札価格・メルカリ売切価格とは性質が異なる。
 */

const JMTY_BASE = "https://jmty.jp/all/sale";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

export type JimotyScrapeOptions = {
  keyword: string;
  excludes?: string;
  limit?: number;
  /** "sold" / "active" / "all" — ジモティーはフィルタなし (全件返却) */
  status?: "sold" | "active" | "all";
  page?: number;
};

export async function scrapeJimoty(
  options: JimotyScrapeOptions,
): Promise<SourceResult> {
  const { keyword, excludes, limit = 30, page = 1 } = options;

  const url = new URL(JMTY_BASE);
  url.searchParams.set("keyword", keyword);
  if (page > 1) url.searchParams.set("page", String(page));

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
    redirect: "follow",
  });

  log.info("status:", res.status, "url:", url.toString());

  if (!res.ok) {
    throw new Error(`ジモティー応答エラー: ${res.status}`);
  }

  const html = await res.text();
  const listings = parseJimotyHtml(html, limit);
  const totalAvailable = parseTotalCount(html);

  log.info("parsed:", listings.length, "total:", totalAvailable);
  if (listings[0]) {
    log.info("sample[0]:", JSON.stringify(listings[0]).slice(0, 200));
  }

  // excludes フィルタ
  let filtered = listings;
  if (excludes?.trim()) {
    const terms = excludes.trim().toLowerCase().split(/\s+/).filter(Boolean);
    filtered = listings.filter((l) =>
      terms.every((term) => !l.title.toLowerCase().includes(term)),
    );
  }

  const hasNextPage = listings.length >= limit;
  return summarize(filtered, totalAvailable, hasNextPage);
}

// ============================================================================
// HTML パーサー
// ============================================================================

function parseJimotyHtml(html: string, limit: number): Listing[] {
  const $ = cheerio.load(html);
  const listings: Listing[] = [];

  $("li.p-articles-list-item").each((_, el) => {
    if (listings.length >= limit) return false;
    const $item = $(el);

    // ── URL & ID ─────────────────────────────────────────
    // p-item-title の <a> を優先。なければ画像リンク
    const $titleLink = $item.find("div.p-item-title a").first();
    const $imageLink = $item.find("div.p-item-image-component a[href*='article-']").first();
    const href =
      $titleLink.attr("href") ??
      $imageLink.attr("href") ??
      "";
    const idMatch = href.match(/article-([a-z0-9_]+)/i);
    if (!idMatch) return;

    // ── タイトル ─────────────────────────────────────────
    // p-item-title テキスト → 画像 alt → img alt フォールバック
    let title = $titleLink.text().trim();
    if (!title || title.length < 3) {
      title =
        $imageLink.find("img").attr("alt")?.trim() ??
        $item.find("img").first().attr("alt")?.trim() ??
        "";
    }
    if (!title || title.length < 3) return;

    // ── 価格 ─────────────────────────────────────────────
    // p-item-most-important > b タグを直接参照 (最も信頼性が高い)
    let price = 0;
    const $priceEl = $item.find("div.p-item-most-important b").first();
    if ($priceEl.length) {
      const raw = $priceEl.text().trim();
      if (/無料|あげます|差し上げ|タダ/.test(raw)) {
        price = 0; // 無料出品
      } else {
        const m = raw.match(/([\d,]+)/);
        if (m) {
          const n = Number(m[1].replace(/,/g, ""));
          if (Number.isFinite(n) && n >= 0 && n < 100_000_000) price = n;
        }
      }
    } else {
      // フォールバック: カードテキスト全体を走査
      const cardText = $item.text();
      if (/無料|あげます|差し上げ|タダ/.test(cardText)) {
        price = 0;
      } else {
        // 「X円」か「¥X」を探す
        const priceMatches = Array.from(
          cardText.matchAll(/[¥￥]([\d,]+)|([\d,]+)\s?円/g),
        );
        const candidates = priceMatches
          .map((m) => Number((m[1] ?? m[2]).replace(/,/g, "")))
          .filter((n) => Number.isFinite(n) && n > 0 && n < 100_000_000);
        price = candidates[0] ?? 0;
      }
    }

    // ── サムネイル ────────────────────────────────────────
    const thumbnail =
      $item.find("div.p-item-image-component img").first().attr("src") ??
      undefined;

    // ── 所在地 ────────────────────────────────────────────
    const location =
      $item.find("div.p-item-secondary-important a").first().text().trim() ||
      undefined;

    // ── 投稿日 / 更新日 ───────────────────────────────────
    // 形式: "更新5月4日" "作成5月3日" / "1日前" "3時間前" 等
    let endedAt = "";
    const historyText = $item.find("div.p-item-history").text().trim();
    const relMatch = historyText.match(/(\d+)\s*(分|時間|日|週間|か月|ヶ月|年)前/);
    const absMatch = historyText.match(/(\d{1,2})月(\d{1,2})日/);
    if (relMatch) {
      const ms = unitToMs(relMatch[2]) * Number(relMatch[1]);
      if (Number.isFinite(ms) && ms > 0) {
        endedAt = new Date(Date.now() - ms).toISOString();
      }
    } else if (absMatch) {
      const month = Number(absMatch[1]);
      const day = Number(absMatch[2]);
      const now = new Date();
      const d = new Date(now.getFullYear(), month - 1, day);
      // 未来日 (年またぎ) → 前年とみなす
      if (d > now) d.setFullYear(now.getFullYear() - 1);
      endedAt = d.toISOString();
    }

    // ── お気に入り数 ──────────────────────────────────────
    let likes: number | undefined;
    const favText = $item.find(".js_favorite_count, [data-favorite-count]").text().trim();
    if (favText) {
      const n = Number(favText);
      if (Number.isFinite(n) && n >= 0) likes = n;
    }
    // データ属性フォールバック
    if (likes === undefined) {
      const dataCount = $item.find("[data-favorite-count]").attr("data-favorite-count");
      if (dataCount !== undefined) {
        const n = Number(dataCount);
        if (Number.isFinite(n) && n >= 0) likes = n;
      }
    }

    listings.push({
      id: idMatch[1],
      title,
      price,
      endedAt,
      thumbnail,
      url: href.startsWith("http") ? href : `https://jmty.jp${href}`,
      location,
      likes,
      sellerType: "individual", // ジモティーは基本的に個人取引
    });
  });

  return listings;
}

// ============================================================================
// ヘルパー
// ============================================================================

function unitToMs(unit: string): number {
  const map: Record<string, number> = {
    分: 60_000,
    時間: 3_600_000,
    日: 86_400_000,
    週間: 604_800_000,
    か月: 2_592_000_000,
    ヶ月: 2_592_000_000,
    年: 31_536_000_000,
  };
  return map[unit] ?? 0;
}

function parseTotalCount(html: string): number | undefined {
  const patterns = [
    /([\d,]+)\s*件中/,
    /約\s*([\d,]+)\s*件/,
    /合計\s*([\d,]+)\s*件/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const n = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

function summarize(
  listings: Listing[],
  totalAvailable?: number,
  hasNextPage?: boolean,
): SourceResult {
  // 価格が 0 の無料出品は相場統計から除外する
  const priced = listings.filter((l) => l.price > 0);
  const prices = priced.map((l) => l.price).sort((a, b) => a - b);
  const count = priced.length;

  if (count === 0) {
    return {
      source: "jimoty",
      count: listings.length, // 無料含む総件数
      median: 0,
      min: 0,
      max: 0,
      listings,
      totalAvailable,
      hasNextPage,
    };
  }

  const median =
    count % 2 === 1
      ? prices[Math.floor(count / 2)]
      : Math.round((prices[count / 2 - 1] + prices[count / 2]) / 2);

  return {
    source: "jimoty",
    count: listings.length,
    median,
    min: prices[0],
    max: prices[count - 1],
    listings,
    totalAvailable,
    hasNextPage,
  };
}
