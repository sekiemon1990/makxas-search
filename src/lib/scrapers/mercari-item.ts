import { generateMercariDpop } from "./mercari-dpop";
import { createLogger } from "@/lib/logger";

const log = createLogger("mercari-item");

/**
 * メルカリ個別商品 API (DPoP 認証)
 *
 * 検索 API では description や複数画像が返ってこないので、
 * 詳細ページ表示時に追加で個別 fetch する。
 */

export type MercariItemDetail = {
  id: string;
  description?: string;
  images?: string[];
  price?: number;
  condition?: string;
  shipping?: "free" | "paid";
  shippingInfo?: string;
  shippingFromArea?: string;
  sellerName?: string;
  sellerUrl?: string;
  sellerRating?: string;
  likes?: number;
};

const ITEM_CONDITION_LABEL: Record<number, string> = {
  1: "新品、未使用",
  2: "未使用に近い",
  3: "目立った傷や汚れなし",
  4: "やや傷や汚れあり",
  5: "傷や汚れあり",
  6: "全体的に状態が悪い",
};

function isMercariShopsId(id: string): boolean {
  return !/^m\d{10,}$/i.test(id);
}

export async function scrapeMercariItem(
  id: string,
): Promise<MercariItemDetail> {
  if (isMercariShopsId(id)) {
    return scrapeMercariShopProduct(id);
  }

  const url = `https://api.mercari.jp/items/get?id=${encodeURIComponent(id)}`;
  const dpop = generateMercariDpop("GET", url);

  log.info("fetching:", url);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "*/*",
      "X-Platform": "web",
      DPoP: dpop,
    },
    cache: "no-store",
  });

  log.info("status:", res.status);

  if (!res.ok) {
    const text = await res.text();
    log.error("error:", text.slice(0, 500));
    throw new Error(`メルカリ商品 API エラー: ${res.status}`);
  }

  const json = (await res.json()) as MercariItemResponse;
  const data = json.data;
  if (!data) {
    log.warn("no data field in response");
    return { id };
  }

  log.info("keys:", Object.keys(data).slice(0, 30).join(","));

  const photos = pickPhotos(data);
  const condition =
    data.item_condition?.name ??
    (typeof data.item_condition_id === "number"
      ? ITEM_CONDITION_LABEL[data.item_condition_id]
      : undefined);

  const shipping: "free" | "paid" | undefined =
    data.shipping_payer?.id === 1
      ? "free"
      : data.shipping_payer?.id === 2
        ? "paid"
        : undefined;
  const shippingInfo = [
    data.shipping_method?.name,
    data.shipping_duration?.name,
  ]
    .filter(Boolean)
    .join(" / ") || undefined;

  const seller = data.seller;
  const sellerName = seller?.name?.trim() || undefined;
  const sellerUrl = seller?.id
    ? `https://jp.mercari.com/user/profile/${seller.id}`
    : undefined;
  const sellerRating =
    typeof seller?.score === "number" || typeof seller?.num_ratings === "number"
      ? formatSellerRating(seller.score, seller.num_ratings)
      : undefined;

  const result: MercariItemDetail = {
    id,
    description:
      typeof data.description === "string" && data.description.trim()
        ? data.description.trim()
        : undefined,
    images: photos.length > 0 ? photos : undefined,
    price: typeof data.price === "number" ? data.price : undefined,
    condition,
    shipping,
    shippingInfo,
    shippingFromArea: data.shipping_from_area?.name ?? undefined,
    sellerName,
    sellerUrl,
    sellerRating,
    likes: typeof data.num_likes === "number" ? data.num_likes : undefined,
  };

  log.info("mapped:", {
    hasDescription: !!result.description,
    descLen: result.description?.length ?? 0,
    imageCount: result.images?.length ?? 0,
    condition: result.condition,
    shipping: result.shipping,
    sellerName: result.sellerName,
    likes: result.likes,
  });

  return result;
}

const SHOP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

async function scrapeMercariShopProduct(
  id: string,
): Promise<MercariItemDetail> {
  const url = `https://jp.mercari.com/shops/product/${id}`;
  log.info("fetching shop product:", url);

  const res = await fetch(url, {
    headers: {
      "User-Agent": SHOP_USER_AGENT,
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
    cache: "no-store",
  });

  log.info("shop status:", res.status);
  if (!res.ok) {
    throw new Error(`メルカリショップ商品ページ取得エラー: ${res.status}`);
  }

  const html = await res.text();
  log.info("shop html size:", html.length);

  log.warn("shop html probe:", {
    hasNextData: html.includes('id="__NEXT_DATA__"'),
    hasApollo: html.includes("__APOLLO_STATE__"),
    hasInitialState: html.includes("__INITIAL_STATE__"),
    hasJsonLd: html.includes('type="application/ld+json"'),
    hasRSCPayload: html.includes("self.__next_f"),
    htmlSize: html.length,
  });

  const ogPick = (prop: string): string | undefined => {
    const m = html.match(
      new RegExp(
        `<meta\\s+property=["']${prop}["']\\s+content=["']([^"']+)["']`,
        "i",
      ),
    );
    return m ? m[1] : undefined;
  };
  const ogTitle = ogPick("og:title");
  const ogDescription = ogPick("og:description");
  const ogImage = ogPick("og:image");
  log.warn("shop og:", {
    hasTitle: !!ogTitle,
    titleSample: ogTitle?.slice(0, 50),
    hasDesc: !!ogDescription,
    descLen: ogDescription?.length ?? 0,
    hasImage: !!ogImage,
  });

  const jsonLdProduct = extractJsonLdProduct(html);
  if (jsonLdProduct) {
    log.warn(
      "shop JSON-LD keys:",
      Object.keys(jsonLdProduct).slice(0, 20).join(","),
    );
  } else {
    log.warn("shop JSON-LD: not found or no Product type");
  }

  if (html.includes("self.__next_f")) {
    const rscMatches = Array.from(
      html.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g),
    );
    log.warn("shop RSC chunks:", {
      count: rscMatches.length,
      totalLen: rscMatches.reduce((s, m) => s + m[1].length, 0),
      firstChunkSample: rscMatches[0]?.[1]
        ?.slice(0, 200)
        .replace(/\\"/g, '"'),
    });
  }

  let product: Record<string, unknown> | null = null;

  if (html.includes("self.__next_f")) {
    product = parseRSCForProduct(html, id);
    if (product) {
      log.warn(
        "shop product (RSC) keys:",
        Object.keys(product).slice(0, 30).join(","),
      );
    } else {
      log.warn("shop product not found in RSC payload");
    }
  }

  if (!product) {
    const nextDataMatch = html.match(
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/,
    );
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1]);
        log.info(
          "shop __NEXT_DATA__ top keys:",
          typeof data === "object" && data
            ? Object.keys(data as object).join(",")
            : "(none)",
        );
        product = findShopProduct(data, id);
        if (product) {
          log.info(
            "shop product (NEXT_DATA) keys:",
            Object.keys(product).slice(0, 30).join(","),
          );
        } else {
          log.warn(
            "shop product not found in __NEXT_DATA__, trying lenient match",
          );
          product = findAnyProductLike(data);
          if (product) {
            log.info(
              "shop product (lenient) keys:",
              Object.keys(product).slice(0, 30).join(","),
            );
          }
        }
      } catch (e) {
        log.error("__NEXT_DATA__ parse failed:", e);
      }
    } else {
      log.warn("__NEXT_DATA__ not found in shop page");
    }
  }

  if (!product) {
    log.warn("falling back to OG / JSON-LD for shop product");
    return mapFromOgAndJsonLd(id, ogTitle, ogDescription, ogImage, jsonLdProduct);
  }

  const images = extractShopImages(product);

  const description =
    pickStr(product, "description") ||
    pickStr(product, "productDescription") ||
    pickStr(product, "detailDescription") ||
    ogDescription ||
    undefined;

  const conditionId =
    pickNum(product, "itemConditionId") ??
    pickNum(product, "condition_id") ??
    pickNum(product, "conditionId");
  const conditionName =
    pickStr(product, "itemConditionName") ||
    pickStr(pickObj(product, "itemCondition"), "name") ||
    pickStr(pickObj(product, "condition"), "name");
  const condition =
    conditionName ||
    (typeof conditionId === "number"
      ? ITEM_CONDITION_LABEL[conditionId]
      : undefined);

  const price = pickNum(product, "price") ?? undefined;

  const shop = pickObj(product, "shop") ?? pickObj(product, "store");
  const sellerName =
    pickStr(product, "shopName") ||
    pickStr(shop, "name") ||
    pickStr(shop, "shopName") ||
    undefined;
  const shopId = pickStr(product, "shopId") || pickStr(shop, "id") || "";
  const sellerUrl = shopId
    ? `https://jp.mercari.com/shops/${shopId}`
    : undefined;

  const shippingPayerId =
    pickNum(pickObj(product, "shippingPayer"), "id") ??
    pickNum(product, "shippingPayerId");
  const shipping: "free" | "paid" | undefined =
    shippingPayerId === 1
      ? "free"
      : shippingPayerId === 2
        ? "paid"
        : undefined;
  const shippingMethod =
    pickStr(pickObj(product, "shippingMethod"), "name") ||
    pickStr(pickObj(product, "shipping_method"), "name");
  const shippingDuration =
    pickStr(pickObj(product, "shippingDuration"), "name") ||
    pickStr(pickObj(product, "shipping_duration"), "name");
  const shippingInfo =
    [shippingMethod, shippingDuration].filter(Boolean).join(" / ") ||
    undefined;
  const shippingFromArea =
    pickStr(pickObj(product, "shippingFromArea"), "name") ||
    pickStr(pickObj(product, "shipping_from_area"), "name");

  const result: MercariItemDetail = {
    id,
    description,
    images: images.length > 0 ? images : undefined,
    price,
    condition,
    shipping,
    shippingInfo,
    shippingFromArea,
    sellerName,
    sellerUrl,
  };

  log.info("shop mapped:", {
    hasDescription: !!result.description,
    descLen: result.description?.length ?? 0,
    imageCount: result.images?.length ?? 0,
    condition: result.condition,
    sellerName: result.sellerName,
    shipping: result.shipping,
  });

  return result;
}

// RSC payload (`self.__next_f.push([1, "..."])`) から商品データを抽出
function parseRSCForProduct(
  html: string,
  productId: string,
): Record<string, unknown> | null {
  const matches = Array.from(
    html.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g),
  );
  if (matches.length === 0) return null;

  const combined = matches
    .map((m) => m[1])
    .join("")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\u([0-9a-f]{4})/gi, (_, c) =>
      String.fromCharCode(parseInt(c, 16)),
    );

  const lines = combined.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const data = line.slice(colonIdx + 1);
    if (
      (data.startsWith("[") || data.startsWith("{")) &&
      (data.includes('"description"') ||
        data.includes('"productName"') ||
        data.includes('"productDescription"'))
    ) {
      try {
        const parsed = JSON.parse(data);
        const found = findShopProduct(parsed, productId);
        if (found) return found;
        const lenient = findAnyProductLike(parsed);
        if (lenient) return lenient;
      } catch {
        // truncated chunk boundary - try next
      }
    }
  }

  // Fallback: scan combined text for JSON objects with product fields
  const objCandidates = combined.matchAll(
    /\{(?:[^{}]|\{[^{}]*\})*"description"(?:[^{}]|\{[^{}]*\})*\}/g,
  );
  for (const m of objCandidates) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed && typeof parsed === "object") {
        const found = findShopProduct(
          parsed as Record<string, unknown>,
          productId,
        );
        if (found) return found;
        const lenient = findAnyProductLike(
          parsed as Record<string, unknown>,
        );
        if (lenient) return lenient;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function findAnyProductLike(
  node: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 14) return null;
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const found = findAnyProductLike(c, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const hasName =
    typeof o.name === "string" ||
    typeof o.productName === "string" ||
    typeof o.title === "string";
  const hasPrice = typeof o.price === "number" || typeof o.price === "string";
  const hasDescription =
    typeof o.description === "string" ||
    typeof o.productDescription === "string";
  let score = 0;
  if (hasName) score++;
  if (hasPrice) score++;
  if (hasDescription) score++;
  if (score >= 2) return o;
  for (const v of Object.values(o)) {
    const found = findAnyProductLike(v, depth + 1);
    if (found) return found;
  }
  return null;
}

function extractJsonLdProduct(html: string): Record<string, unknown> | null {
  const matches = html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  );
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of arr) {
        if (
          node &&
          typeof node === "object" &&
          ((node as { "@type"?: string })["@type"] === "Product" ||
            (Array.isArray((node as { "@type"?: string[] })["@type"]) &&
              ((node as { "@type"?: string[] })["@type"] as string[]).includes(
                "Product",
              )))
        ) {
          return node as Record<string, unknown>;
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function mapFromOgAndJsonLd(
  id: string,
  ogTitle: string | undefined,
  ogDescription: string | undefined,
  ogImage: string | undefined,
  jsonLd: Record<string, unknown> | null,
): MercariItemDetail {
  const title =
    ogTitle ??
    (typeof jsonLd?.name === "string" ? (jsonLd.name as string) : undefined);
  const description =
    (typeof jsonLd?.description === "string"
      ? (jsonLd.description as string)
      : undefined) ?? ogDescription;
  let price: number | undefined;
  const offers = jsonLd?.offers as Record<string, unknown> | undefined;
  if (offers) {
    const p = offers.price ?? offers.lowPrice;
    if (typeof p === "number") price = p;
    else if (typeof p === "string") {
      const n = Number(p.replace(/[^\d.]/g, ""));
      if (Number.isFinite(n)) price = n;
    }
  }
  const images: string[] = [];
  const ldImage = jsonLd?.image;
  if (Array.isArray(ldImage)) {
    for (const v of ldImage) {
      if (typeof v === "string") images.push(v);
    }
  } else if (typeof ldImage === "string") {
    images.push(ldImage);
  }
  if (images.length === 0 && ogImage) images.push(ogImage);

  const seller = (jsonLd?.brand ??
    (offers?.seller as Record<string, unknown> | undefined)) as
    | Record<string, unknown>
    | undefined;
  const sellerName =
    typeof seller?.name === "string" ? (seller.name as string) : undefined;

  return {
    id,
    description,
    images: images.length > 0 ? images : undefined,
    price,
    sellerName,
  };
}

function findShopProduct(
  node: unknown,
  targetId: string,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 14) return null;
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const found = findShopProduct(c, targetId, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const idMatch =
    o.id === targetId || o.productId === targetId || o.product_id === targetId;
  const hasFields =
    typeof o.name === "string" || typeof o.productName === "string";
  if (idMatch && hasFields) return o;
  for (const v of Object.values(o)) {
    const found = findShopProduct(v, targetId, depth + 1);
    if (found) return found;
  }
  return null;
}

function extractShopImages(o: Record<string, unknown>): string[] {
  const out: string[] = [];
  const photos = o.photos;
  if (Array.isArray(photos)) {
    for (const p of photos) {
      if (typeof p === "string") out.push(p);
      else if (p && typeof p === "object") {
        const url =
          (p as Record<string, unknown>).url ??
          (p as Record<string, unknown>).uri;
        if (typeof url === "string") out.push(url);
      }
    }
  }
  if (out.length === 0 && Array.isArray(o.thumbnails)) {
    for (const t of o.thumbnails as unknown[]) {
      if (typeof t === "string") out.push(t);
    }
  }
  if (out.length === 0) {
    const arr =
      (Array.isArray(o.productImage) && o.productImage) ||
      (Array.isArray(o.images) && o.images) ||
      null;
    if (arr) {
      for (const it of arr) {
        if (typeof it === "string") out.push(it);
        else if (it && typeof it === "object") {
          const u =
            (it as Record<string, unknown>).url ??
            (it as Record<string, unknown>).uri;
          if (typeof u === "string") out.push(u);
        }
      }
    }
  }
  return out;
}

function pickStr(
  o: Record<string, unknown> | undefined | null,
  key: string,
): string | undefined {
  if (!o) return undefined;
  const v = o[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

function pickNum(
  o: Record<string, unknown> | undefined | null,
  key: string,
): number | undefined {
  if (!o) return undefined;
  const v = o[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickObj(
  o: Record<string, unknown> | undefined | null,
  key: string,
): Record<string, unknown> | undefined {
  if (!o) return undefined;
  const v = o[key];
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function pickPhotos(d: MercariItemData): string[] {
  if (Array.isArray(d.photos) && d.photos.length > 0) {
    return d.photos
      .map((p) => (typeof p === "string" ? p : p?.url))
      .filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  if (Array.isArray(d.thumbnails) && d.thumbnails.length > 0) {
    return d.thumbnails.filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
  }
  return [];
}

function formatSellerRating(
  score: number | undefined,
  ratings: number | undefined,
): string {
  if (typeof score === "number" && typeof ratings === "number") {
    return `★ ${score.toFixed(1)} (${ratings}件)`;
  }
  if (typeof ratings === "number") return `${ratings}件の評価`;
  if (typeof score === "number") return `★ ${score.toFixed(1)}`;
  return "";
}

type MercariPhoto = string | { url?: string };

type MercariItemData = {
  id?: string;
  name?: string;
  description?: string;
  photos?: MercariPhoto[];
  thumbnails?: string[];
  price?: number;
  status?: string;
  item_condition_id?: number;
  item_condition?: { id?: number; name?: string };
  shipping_payer?: { id?: number; name?: string };
  shipping_method?: { id?: number; name?: string };
  shipping_duration?: { id?: number; name?: string };
  shipping_from_area?: { id?: number; name?: string };
  num_likes?: number;
  num_comments?: number;
  seller?: {
    id?: number;
    name?: string;
    photo_url?: string;
    num_ratings?: number;
    score?: number;
  };
};

type MercariItemResponse = {
  result?: string;
  data?: MercariItemData;
};
