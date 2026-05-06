"use client";

import Link from "next/link";
import Image from "next/image";
import { notFound, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Gavel,
  Heart,
  CalendarDays,
  User,
  Truck,
  MapPin,
  Tag,
  Package,
  Sparkles,
  Star,
  StickyNote,
  ListPlus,
  Check,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SourceBadge } from "@/components/SourceBadge";
import { PlatformLogo } from "@/components/PlatformLogo";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ConditionBadge } from "@/components/ConditionBadge";
import { ShippingBadge } from "@/components/ShippingBadge";
import { MOCK_RESULT } from "@/lib/mock-data";
import { useQuery } from "@tanstack/react-query";
import type { SourceResult, Listing } from "@/lib/types";
import { formatYen, formatJSTDateTime } from "@/lib/utils";
import { RelativeDate } from "@/components/RelativeDate";
import { detectAccessories } from "@/lib/accessories";
import { classifyCondition } from "@/lib/conditions";
import { calculateNetValue } from "@/lib/net-value";
import {
  recordListingView,
  setListingMemo,
  setListingPinned,
  useListingMemoValue,
  useListingPinnedValue,
  haptic,
} from "@/lib/storage";
import { MOCK_RESULT as MOCK } from "@/lib/mock-data";
import { SOURCES, getStoreLabel, type SourceKey } from "@/lib/types";
import { addItemToList, removeItem, useDefaultQuery, useIsInListByKeyword } from "@/lib/list";
import { toast } from "@/lib/toast";

function parseRef(ref: string): { source: SourceKey; lid: string } | null {
  const [src, ...rest] = ref.split("-");
  const lid = rest.join("-");
  if (!SOURCES.find((s) => s.key === src)) return null;
  return { source: src as SourceKey, lid };
}

function DetailInner({ id, listingRefParam }: { id: string; listingRefParam: string }) {
  const params = useSearchParams();
  const parsed = parseRef(listingRefParam);

  // ⚠️ React hooks のルール: return 文より前に全 hooks を呼ぶ必要あり
  const source = parsed?.source ?? ("yahoo_auction" as SourceKey);
  const lid = parsed?.lid ?? "";
  const fromKeyword = params.get("keyword") ?? undefined;
  const fromExcludes = params.get("excludes") ?? "";
  const resultRank = params.get("rank") ? Number(params.get("rank")) : undefined;
  // id は検索ID（URLパスに含まれる）。"list_xxx" 形式はリストページ経由なので除外
  const searchId = id && !id.startsWith("list_") ? id : undefined;

  const yahooQuery = useQuery({
    queryKey: ["scrape_yahoo", fromKeyword ?? "", fromExcludes],
    queryFn: async (): Promise<SourceResult> => {
      const res = await fetch("/api/scrape/yahoo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: fromKeyword,
          excludes: fromExcludes || undefined,
        }),
      });
      if (!res.ok) throw new Error("ヤフオク取得失敗");
      const data = (await res.json()) as { result: SourceResult };
      return data.result;
    },
    enabled: !!parsed && source === "yahoo_auction" && !!fromKeyword,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const jimotyQuery = useQuery({
    queryKey: ["scrape_jimoty", fromKeyword ?? "", fromExcludes],
    queryFn: async (): Promise<SourceResult> => {
      const res = await fetch("/api/scrape/jimoty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: fromKeyword,
          excludes: fromExcludes || undefined,
        }),
      });
      if (!res.ok) throw new Error("ジモティー取得失敗");
      const data = (await res.json()) as { result: SourceResult };
      return data.result;
    },
    enabled: !!parsed && source === "jimoty" && !!fromKeyword,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const mercariQuery = useQuery({
    queryKey: ["scrape_mercari", fromKeyword ?? "", fromExcludes],
    queryFn: async (): Promise<SourceResult> => {
      const res = await fetch("/api/scrape/mercari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: fromKeyword,
          excludes: fromExcludes || undefined,
        }),
      });
      if (!res.ok) throw new Error("メルカリ取得失敗");
      const data = (await res.json()) as { result: SourceResult };
      return data.result;
    },
    enabled: !!parsed && source === "mercari" && !!fromKeyword,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // 探索順: 本物のスクレイピング結果 → モック
  // (後で fallback で再代入する箇所もあるため let を採用)
  let baseListing: Listing | undefined =
    (parsed && source === "yahoo_auction" && yahooQuery.data
      ? yahooQuery.data.listings.find((l) => l.id === lid)
      : undefined) ||
    (parsed && source === "jimoty" && jimotyQuery.data
      ? jimotyQuery.data.listings.find((l) => l.id === lid)
      : undefined) ||
    (parsed && source === "mercari" && mercariQuery.data
      ? mercariQuery.data.listings.find((l) => l.id === lid)
      : undefined) ||
    (parsed
      ? MOCK_RESULT.sources
          .find((s) => s.source === source)
          ?.listings.find((l) => l.id === lid)
      : undefined);

  // 個別商品ページから詳細データ (description, images 等) を追加 fetch
  const isFleamarket = baseListing?.url?.includes("paypayfleamarket") ?? false;
  const detailQuery = useQuery({
    queryKey: ["yahoo_item", source, lid, isFleamarket],
    queryFn: async () => {
      const res = await fetch("/api/scrape/yahoo-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lid, isFleamarket }),
      });
      if (!res.ok) throw new Error("商品詳細取得失敗");
      const data = (await res.json()) as {
        detail: {
          id: string;
          title?: string;
          price?: number;
          endedAt?: string;
          url?: string;
          bidCount?: number;
          thumbnail?: string;
          description?: string;
          images?: string[];
          condition?: string;
          sellerName?: string;
          sellerUrl?: string;
          sellerRating?: string;
          shipping?: "free" | "paid" | "pickup";
          shippingInfo?: string;
          location?: string;
          likes?: number;
        };
      };
      return data.detail;
    },
    // baseListing が無い (= URL から直接アクセス、keyword 無し) でも動くよう
    // source と lid だけで enable する
    enabled: source === "yahoo_auction" && !!lid,
    staleTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // メルカリ個別商品 API からの追加データ (description, 複数画像, 出品者等)
  const mercariItemQuery = useQuery({
    queryKey: ["mercari_item", source, lid],
    queryFn: async () => {
      const res = await fetch("/api/scrape/mercari-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lid }),
      });
      if (!res.ok) throw new Error("商品詳細取得失敗");
      const data = (await res.json()) as {
        detail: {
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
      };
      return data.detail;
    },
    enabled: source === "mercari" && !!lid,
    staleTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // ジモティー個別商品ページからの追加データ (description, images, price 等)
  const jimotyItemQuery = useQuery({
    queryKey: ["jimoty_item", source, lid, baseListing?.url ?? ""],
    queryFn: async () => {
      if (!baseListing?.url) throw new Error("URL なし");
      const res = await fetch("/api/scrape/jimoty-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: baseListing.url }),
      });
      if (!res.ok) throw new Error("商品詳細取得失敗");
      const data = (await res.json()) as {
        detail: {
          id: string;
          description?: string;
          images?: string[];
          price?: number;
          sellerName?: string;
          sellerUrl?: string;
          sellerRating?: string;
          location?: string;
          likes?: number;
        };
      };
      return data.detail;
    },
    enabled: !!baseListing?.url && source === "jimoty",
    staleTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const [activeImage, setActiveImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [memoEditing, setMemoEditing] = useState(false);
  const [memoDraft, setMemoDraft] = useState<string | null>(null);
  const [addedToList, setAddedToList] = useState(false);
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [defaultQuery] = useDefaultQuery();
  const { isInList, existingItemId } = useIsInListByKeyword(fromKeyword);

  const listingRef = `${source}-${lid}`;
  const pinned = useListingPinnedValue(listingRef);
  const memo = useListingMemoValue(listingRef);

  // 閲覧履歴の記録 (baseListing が無い時はスキップ)
  useEffect(() => {
    if (!baseListing) return;
    recordListingView({
      ref: listingRef,
      source,
      title: baseListing.title,
      price: baseListing.price,
      thumbnail: baseListing.thumbnail,
      endedAt: baseListing.endedAt,
      condition: baseListing.condition,
      fromKeyword,
      searchId,
      resultRank,
      fromPage: searchId ? "search_result" : id.startsWith("list_") ? "list" : "direct",
    });
  }, [
    baseListing,
    listingRef,
    source,
    fromKeyword,
    id,
    resultRank,
    searchId,
  ]);

  // 全 hooks を呼んだあとで早期リターン
  if (!parsed) return notFound();

  // データ取得中のローディング
  const isFetchingSource =
    (source === "yahoo_auction" &&
      (yahooQuery.isLoading || yahooQuery.isFetching)) ||
    (source === "jimoty" && (jimotyQuery.isLoading || jimotyQuery.isFetching)) ||
    (source === "mercari" &&
      (mercariQuery.isLoading || mercariQuery.isFetching));
  if (!baseListing && fromKeyword && isFetchingSource) {
    return (
      <div className="pt-12 text-center text-muted text-sm">
        商品情報を取得中...
      </div>
    );
  }

  // baseListing が無い場合、mercari-item の結果からフォールバック
  // (URL 直接アクセス・keyword 欠落時)
  if (!baseListing && source === "mercari") {
    const m = mercariItemQuery.data;
    if (mercariItemQuery.isLoading || mercariItemQuery.isFetching) {
      return (
        <div className="pt-12 text-center text-muted text-sm">
          商品情報を取得中...
        </div>
      );
    }
    if (m && m.images && m.images.length > 0) {
      // eslint-disable-next-line react-hooks/immutability
      baseListing = {
        id: lid,
        title: "",
        price: m.price ?? 0,
        endedAt: "",
        thumbnail: m.images[0],
        url: `https://jp.mercari.com/item/${lid}`,
        likes: m.likes,
        condition: m.condition,
        shipping: m.shipping,
        shippingInfo: m.shippingInfo,
        location: m.shippingFromArea,
        description: m.description,
        images: m.images,
        sellerName: m.sellerName,
        sellerUrl: m.sellerUrl,
        sellerRating: m.sellerRating,
      };
    }
  }

  // baseListing が無い場合、yahoo-item / jimoty-item の結果から最低限の
  // baseListing を組み立てるフォールバック (URL 直接アクセスや keyword 欠落時)
  if (!baseListing && source === "yahoo_auction") {
    const d = detailQuery.data;
    if (detailQuery.isLoading || detailQuery.isFetching) {
      return (
        <div className="pt-12 text-center text-muted text-sm">
          商品情報を取得中...
        </div>
      );
    }
    if (d && d.title) {
      baseListing = {
        id: lid,
        title: d.title,
        price: d.price ?? 0,
        endedAt: d.endedAt ?? "",
        thumbnail: d.thumbnail,
        url:
          d.url ??
          `https://auctions.yahoo.co.jp/jp/auction/${lid}`,
        bidCount: d.bidCount,
        likes: d.likes,
        condition: d.condition,
        sellerName: d.sellerName,
        sellerUrl: d.sellerUrl,
        sellerRating: d.sellerRating,
        shipping: d.shipping,
        shippingInfo: d.shippingInfo,
        location: d.location,
        description: d.description,
        images: d.images,
      };
    }
  }

  if (!baseListing) return notFound();

  // 詳細データを基本データにマージ (詳細データ優先)
  const listing: Listing = {
    ...baseListing,
    description:
      detailQuery.data?.description ??
      jimotyItemQuery.data?.description ??
      mercariItemQuery.data?.description ??
      baseListing.description,
    images:
      detailQuery.data?.images ??
      jimotyItemQuery.data?.images ??
      mercariItemQuery.data?.images ??
      baseListing.images,
    condition:
      detailQuery.data?.condition ??
      mercariItemQuery.data?.condition ??
      baseListing.condition,
    sellerName:
      detailQuery.data?.sellerName ??
      jimotyItemQuery.data?.sellerName ??
      mercariItemQuery.data?.sellerName ??
      baseListing.sellerName,
    sellerUrl:
      detailQuery.data?.sellerUrl ??
      jimotyItemQuery.data?.sellerUrl ??
      mercariItemQuery.data?.sellerUrl ??
      baseListing.sellerUrl,
    sellerRating:
      detailQuery.data?.sellerRating ??
      jimotyItemQuery.data?.sellerRating ??
      mercariItemQuery.data?.sellerRating ??
      baseListing.sellerRating,
    shipping:
      detailQuery.data?.shipping ??
      mercariItemQuery.data?.shipping ??
      baseListing.shipping,
    shippingInfo:
      detailQuery.data?.shippingInfo ??
      mercariItemQuery.data?.shippingInfo ??
      baseListing.shippingInfo,
    location:
      detailQuery.data?.location ??
      jimotyItemQuery.data?.location ??
      mercariItemQuery.data?.shippingFromArea ??
      baseListing.location,
    price:
      (jimotyItemQuery.data?.price && jimotyItemQuery.data.price > 0
        ? jimotyItemQuery.data.price
        : undefined) ??
      (mercariItemQuery.data?.price && mercariItemQuery.data.price > 0
        ? mercariItemQuery.data.price
        : undefined) ??
      baseListing.price,
    likes:
      detailQuery.data?.likes ??
      jimotyItemQuery.data?.likes ??
      mercariItemQuery.data?.likes ??
      baseListing.likes,
  };

  const meta = SOURCES.find((s) => s.key === source)!;
  const images =
    listing.images && listing.images.length > 0
      ? listing.images
      : listing.thumbnail
        ? [listing.thumbnail]
        : [];

  function startMemoEdit() {
    setMemoDraft(memo);
    setMemoEditing(true);
  }

  function saveMemo() {
    if (memoDraft !== null) setListingMemo(listingRef, memoDraft);
    haptic(8);
    setMemoEditing(false);
    setMemoDraft(null);
  }

  function cancelMemoEdit() {
    setMemoEditing(false);
    setMemoDraft(null);
  }

  const queryStr = new URLSearchParams(params.toString()).toString();
  const backHref = `/search/result/${id}${queryStr ? `?${queryStr}` : ""}`;

  // 前後ナビ用：全媒体のリスティングをフラット化
  const flatListings = MOCK.sources.flatMap((s) =>
    s.listings.map((l) => ({ ...l, source: s.source }))
  );
  const currentIdx = flatListings.findIndex(
    (l) => l.source === source && l.id === lid
  );
  const prev = currentIdx > 0 ? flatListings[currentIdx - 1] : null;
  const next =
    currentIdx >= 0 && currentIdx < flatListings.length - 1
      ? flatListings[currentIdx + 1]
      : null;

  function goToListing(target: { source: SourceKey; id: string }) {
    const targetRef = `${target.source}-${target.id}`;
    const url = `/search/result/${id}/listing/${targetRef}${queryStr ? `?${queryStr}` : ""}`;
    window.location.href = url;
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-6 lg:items-start">
      {/* 画像エリア (PC では左カラム sticky) */}
      <section className="lg:sticky lg:top-20">
        {images.length > 0 ? (
          <ImageGallery
            images={images}
            activeIndex={activeImage}
            onChange={setActiveImage}
            onZoom={() => setLightboxOpen(true)}
          />
        ) : (
          <div className="w-full aspect-square rounded-xl bg-surface-2 border border-border flex items-center justify-center text-muted text-sm">
            画像なし
          </div>
        )}
      </section>

      {/* 情報エリア (PC では右カラム) */}
      <div className="flex flex-col gap-4 min-w-0">
      {/* タイトル / 価格 */}
      <section className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <SourceBadge source={source} />
            <ConditionBadge
              rank={classifyCondition(listing.condition)}
              size="sm"
            />
            <ShippingBadge shipping={listing.shipping} size="sm" />
            <span className="text-xs text-muted">{meta.status}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setListingPinned(listingRef, !pinned);
              haptic(8);
            }}
            aria-label={pinned ? "ピンを外す" : "ピン留め"}
            className={
              pinned
                ? "shrink-0 -mt-1 -mr-1 w-9 h-9 rounded-lg flex items-center justify-center bg-warning/10 text-warning"
                : "shrink-0 -mt-1 -mr-1 w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-2"
            }
          >
            <Star size={18} fill={pinned ? "currentColor" : "none"} />
          </button>
        </div>
        <h1 className="text-base font-bold text-foreground leading-snug">
          {listing.title}
        </h1>
        <div className="flex items-baseline gap-2 mt-3">
          <span className="text-2xl font-bold text-foreground">
            {formatYen(listing.price)}
          </span>
          {listing.bidCount !== undefined && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Gavel size={12} />
              入札{listing.bidCount}件
            </span>
          )}
          {listing.likes !== undefined && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Heart size={12} />
              いいね{listing.likes}
            </span>
          )}
        </div>
        {/* リストに追加 */}
        <button
          type="button"
          onClick={async () => {
            if (addedToList) return;
            // 元の検索KWが既にリストにある場合は確認ダイアログ
            if (isInList && fromKeyword) {
              setShowReplaceDialog(true);
              return;
            }
            await addItemToList({
              keyword: listing.title,
              period: defaultQuery.period,
              sources: defaultQuery.sources,
              conditions: defaultQuery.conditions,
              shipping: defaultQuery.shipping,
            }, "listing");
            setAddedToList(true);
            toast({ message: "査定リストに追加しました。相場検索を開始します。" });
          }}
          className={`mt-3 w-full h-10 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold transition-colors ${
            addedToList
              ? "bg-success/10 text-success border border-success/30"
              : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
          }`}
        >
          {addedToList ? (
            <><Check size={15} />リストに追加済み</>
          ) : (
            <><ListPlus size={15} />査定リストに追加</>
          )}
        </button>

        {/* 既存KW削除確認ダイアログ */}
        {showReplaceDialog && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8">
            <div className="bg-surface rounded-2xl p-5 w-full max-w-sm shadow-xl">
              <h3 className="text-sm font-bold text-foreground mb-1">リストのキーワードを削除しますか？</h3>
              <p className="text-xs text-muted mb-4">
                「{fromKeyword}」がすでにリストにあります。<br />
                この商品を追加する際に元のキーワード検索を削除して入れ替えることができます。
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (existingItemId) await removeItem(existingItemId);
                    await addItemToList({
                      keyword: listing.title,
                      period: defaultQuery.period,
                      sources: defaultQuery.sources,
                      conditions: defaultQuery.conditions,
                      shipping: defaultQuery.shipping,
                    }, "listing");
                    setAddedToList(true);
                    setShowReplaceDialog(false);
                    toast({ message: "入れ替えました。相場検索を開始します。" });
                  }}
                  className="w-full h-11 rounded-xl bg-danger/10 text-danger text-sm font-semibold border border-danger/20"
                >
                  「{fromKeyword}」を削除して入れ替え
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await addItemToList({
                      keyword: listing.title,
                      period: defaultQuery.period,
                      sources: defaultQuery.sources,
                      conditions: defaultQuery.conditions,
                      shipping: defaultQuery.shipping,
                    }, "listing");
                    setAddedToList(true);
                    setShowReplaceDialog(false);
                    toast({ message: "リストに追加しました。相場検索を開始します。" });
                  }}
                  className="w-full h-11 rounded-xl bg-primary/10 text-primary text-sm font-semibold border border-primary/20"
                >
                  両方リストに残す
                </button>
                <button
                  type="button"
                  onClick={() => setShowReplaceDialog(false)}
                  className="w-full h-11 rounded-xl border border-border text-muted text-sm"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 詳細情報 */}
      <section className="bg-surface border border-border rounded-xl divide-y divide-border">
        {listing.condition && (
          <DetailRow
            icon={<Tag size={16} />}
            label="状態"
            value={listing.condition}
          />
        )}
        <DetailRow
          icon={<CalendarDays size={16} />}
          label={meta.status}
          value={<RelativeDate iso={listing.endedAt} />}
          sub={formatJSTDateTime(listing.endedAt)}
        />
        {listing.sellerName && (
          <DetailRow
            icon={<User size={16} />}
            label="出品者"
            value={
              <span className="inline-flex items-center gap-1.5">
                {listing.sellerUrl ? (
                  <a
                    href={listing.sellerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    {listing.sellerName}
                    <ExternalLink size={11} className="shrink-0" />
                  </a>
                ) : (
                  listing.sellerName
                )}
                {listing.sellerType === "store" && (
                  <span className="inline-flex items-center px-1.5 h-5 rounded text-[10px] font-medium bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-200 dark:border-amber-900">
                    {getStoreLabel(source)}
                  </span>
                )}
              </span>
            }
            sub={listing.sellerRating}
          />
        )}
        {listing.shippingInfo && (
          <DetailRow
            icon={<Truck size={16} />}
            label="配送"
            value={listing.shippingInfo}
          />
        )}
        {listing.location && (
          <DetailRow
            icon={<MapPin size={16} />}
            label="所在地"
            value={listing.location}
          />
        )}
      </section>

      {/* 実質商品価値 */}
      <NetValueSection
        title={listing.title}
        price={listing.price}
        shipping={listing.shipping}
        source={source}
      />

      {/* 付属品 */}
      <AccessoriesSection
        title={listing.title}
        description={listing.description}
        accessories={listing.accessories}
        images={images}
      />

      {/* 商品説明 */}
      {listing.description && (
        <section className="bg-surface border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            商品説明
          </h2>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {listing.description}
          </p>
        </section>
      )}

      {/* CTA */}
      <a
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer"
        className="h-14 rounded-lg flex items-center justify-center gap-2 text-base font-bold shadow-sm transition-colors"
        style={{
          backgroundColor: meta.color,
          color: "white",
        }}
      >
        <PlatformLogo source={source} size={20} />
        {meta.name}で詳細を見る
        <ExternalLink size={18} />
      </a>

      {/* 前後ナビ */}
      {(prev || next) && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!prev}
            onClick={() => prev && goToListing(prev)}
            className="h-11 rounded-lg border border-border bg-surface text-foreground text-xs font-medium hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          >
            <span>‹</span>
            <span className="truncate max-w-[160px]">
              {prev ? `前: ${prev.title}` : "なし"}
            </span>
          </button>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && goToListing(next)}
            className="h-11 rounded-lg border border-border bg-surface text-foreground text-xs font-medium hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          >
            <span className="truncate max-w-[160px]">
              {next ? `次: ${next.title}` : "なし"}
            </span>
            <span>›</span>
          </button>
        </div>
      )}

      <Link
        href={backHref}
        className="h-12 rounded-lg border border-border bg-surface text-foreground text-sm font-medium hover:bg-surface-2 flex items-center justify-center"
      >
        検索結果に戻る
      </Link>

      {/* 査定メモ（商品単位） */}
      <section className="bg-surface border border-border rounded-xl p-4 mt-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <StickyNote size={16} className="text-warning" />
            <span className="text-sm font-semibold text-foreground">
              査定メモ
            </span>
          </div>
          {!memoEditing && (
            <button
              type="button"
              onClick={startMemoEdit}
              className="text-xs text-primary hover:underline"
            >
              {memo ? "編集" : "+ 追加"}
            </button>
          )}
        </div>
        {memoEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={memoDraft ?? ""}
              onChange={(e) => setMemoDraft(e.target.value)}
              rows={3}
              placeholder="例: ¥120,000で買取打診したい候補。状態Bランクを目安"
              className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelMemoEdit}
                className="flex-1 h-9 rounded-lg border border-border text-foreground text-sm hover:bg-surface-2"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveMemo}
                className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                保存
              </button>
            </div>
          </div>
        ) : memo ? (
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {memo}
          </p>
        ) : (
          <p className="text-xs text-muted">
            この商品にメモを残せます。閲覧履歴から一覧で確認できます。
          </p>
        )}
      </section>

      <section className="bg-surface-2 rounded-xl p-3 mt-2">
        <p className="text-xs text-muted leading-relaxed">
          ※ この情報は{meta.name}から取得した時点のスナップショットです。
          最新の情報は媒体のページでご確認ください。
        </p>
      </section>
      </div> {/* /情報エリア */}

      {lightboxOpen && images[activeImage] && (
        <ImageLightbox
          src={images[activeImage]}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

function ImageGallery({
  images,
  activeIndex,
  onChange,
  onZoom,
}: {
  images: string[];
  activeIndex: number;
  onChange: (i: number) => void;
  onZoom: () => void;
}) {
  const touchStartXRef = useRef({ x: 0 });
  const touchEndXRef = useRef({ x: 0 });

  function onTouchStart(e: React.TouchEvent) {
    touchStartXRef.current.x = e.touches[0].clientX;
    touchEndXRef.current.x = e.touches[0].clientX;
  }
  function onTouchMove(e: React.TouchEvent) {
    touchEndXRef.current.x = e.touches[0].clientX;
  }
  function onTouchEnd() {
    const dx = touchEndXRef.current.x - touchStartXRef.current.x;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && activeIndex < images.length - 1) {
      onChange(activeIndex + 1);
    } else if (dx > 0 && activeIndex > 0) {
      onChange(activeIndex - 1);
    }
  }

  return (
    <>
      <div
        className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-2 border border-border"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={onZoom}
          className="block w-full h-full"
          aria-label="画像を拡大"
        >
          <Image
            src={images[activeIndex]}
            alt=""
            width={800}
            height={800}
            unoptimized
            priority
            className="w-full h-full object-cover"
          />
        </button>
        {images.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full bg-black/50 text-white text-[11px] font-medium">
            {activeIndex + 1} / {images.length}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => onChange(i)}
              className={
                i === activeIndex
                  ? "shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 border-primary"
                  : "shrink-0 w-16 h-16 rounded-md overflow-hidden border border-border opacity-70"
              }
            >
              <Image
                src={src}
                alt=""
                width={64}
                height={64}
                unoptimized
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function NetValueSection({
  title,
  price,
  shipping,
  source,
}: {
  title: string;
  price: number;
  shipping?: "free" | "paid" | "pickup";
  source: SourceKey;
}) {
  if (!shipping) return null;

  const breakdown = calculateNetValue({
    source,
    shipping,
    listedPrice: price,
    title,
  });

  const meta = SOURCES.find((s) => s.key === source)!;

  return (
    <section className="bg-warning/10 border border-warning/30 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Truck size={16} className="text-warning" />
        <h2 className="text-sm font-semibold text-foreground">
          実質商品価値の内訳
        </h2>
      </div>
      <p className="text-xs text-muted leading-relaxed mb-3">
        表示価格から手数料・送料・販売コストを差し引いた、
        実際に手元に残る「商品としての価値」です。買取額の判断基準に。
      </p>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted">表示価格</span>
          <span className="font-semibold text-foreground">
            ¥{breakdown.listedPrice.toLocaleString("ja-JP")}
          </span>
        </div>
        {breakdown.platformFee > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted">
              {meta.name}手数料
              <span className="ml-1 text-[10px]">
                ({Math.round(breakdown.platformFeeRate * 1000) / 10}%)
              </span>
            </span>
            <span className="font-semibold text-warning">
              − ¥{breakdown.platformFee.toLocaleString("ja-JP")}
            </span>
          </div>
        )}
        {breakdown.shippingCost > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted">
              想定送料
              <span className="ml-1 text-[10px]">({breakdown.shippingSize})</span>
            </span>
            <span className="font-semibold text-warning">
              − ¥{breakdown.shippingCost.toLocaleString("ja-JP")}
            </span>
          </div>
        )}
        {breakdown.salesCost > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted">
              販売コスト
              <span className="ml-1 text-[10px]">(梱包・出品作業)</span>
            </span>
            <span className="font-semibold text-warning">
              − ¥{breakdown.salesCost.toLocaleString("ja-JP")}
            </span>
          </div>
        )}
        <div className="border-t border-border pt-1.5 flex items-center justify-between">
          <span className="text-foreground font-semibold">実質商品価値</span>
          <span className="text-base font-bold text-success">
            ¥{breakdown.netValue.toLocaleString("ja-JP")}
          </span>
        </div>
      </div>
    </section>
  );
}

function AccessoriesSection({
  title,
  description,
  accessories,
  images,
}: {
  title?: string;
  description?: string;
  accessories?: string[];
  images?: string[];
}) {
  const textResult = detectAccessories({ title, description, accessories });

  // 本文/タイトルから何も抽出できなかった時のみ、画像から AI 検出にフォールバック
  const shouldUseImages =
    textResult.items.length === 0 &&
    Array.isArray(images) &&
    images.length > 0;

  const imageQuery = useQuery({
    queryKey: ["detect_accessories_img", images?.slice(0, 4).join("|") ?? ""],
    queryFn: async (): Promise<{ accessories: string[] }> => {
      const res = await fetch("/api/detect-accessories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: images?.slice(0, 4) ?? [],
          productHint: title,
        }),
      });
      if (!res.ok) return { accessories: [] };
      return (await res.json()) as { accessories: string[] };
    },
    enabled: shouldUseImages,
    staleTime: 60 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const items = textResult.items.length > 0
    ? textResult.items
    : imageQuery.data?.accessories ?? [];
  const isInferred = textResult.items.length > 0
    ? textResult.isInferred
    : (imageQuery.data?.accessories ?? []).length > 0;
  const fromImages = textResult.items.length === 0 && items.length > 0;

  // ローディング表示: 画像 AI 検出中で、まだテキスト結果も無い場合
  if (shouldUseImages && imageQuery.isLoading && items.length === 0) {
    return (
      <section className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">付属品</h2>
          <span className="text-[10px] text-muted">
            画像から AI 検出中...
          </span>
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">付属品</h2>
        </div>
        {isInferred && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted px-2 py-0.5 rounded-full bg-surface-2">
            <Sparkles size={10} />
            {fromImages ? "画像から AI 抽出" : "本文から自動抽出"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((a) => (
          <span
            key={a}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-surface-2 text-foreground border border-border"
          >
            {a}
          </span>
        ))}
      </div>
      {isInferred && (
        <p className="text-[11px] text-muted mt-2 leading-relaxed">
          ※{" "}
          {fromImages
            ? "出品画像から AI が自動推定した結果です。"
            : "本文中のキーワードから自動抽出した結果です。"}
          実際の付属品とは異なる場合があります。
        </p>
      )}
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="text-muted mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <span className="text-xs text-muted shrink-0">{label}</span>
        <div className="text-right min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {value}
          </div>
          {sub && (
            <div className="text-xs text-muted mt-0.5 truncate">{sub}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string; ref: string }>;
}) {
  const { id, ref } = use(params);
  return (
    <AppShell
      back={{ href: `/search/result/${id}`, label: "結果" }}
      title="出品詳細"
    >
      <Suspense
        fallback={
          <div className="pt-8 text-center text-muted text-sm">
            読み込み中...
          </div>
        }
      >
        <DetailInner id={id} listingRefParam={ref} />
      </Suspense>
    </AppShell>
  );
}
