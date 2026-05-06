"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Sparkles,
  ExternalLink,
  Gavel,
  Heart,
  Link2,
  Check,
  ArrowUpDown,
  Filter,
  Star,
  StickyNote,
  AlertTriangle,
  Inbox,
  X,
  Share2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  MoreVertical,
} from "lucide-react";
import Image from "next/image";
import { AppShell } from "@/components/AppShell";
import { SourceBadge } from "@/components/SourceBadge";
import { PlatformLogo } from "@/components/PlatformLogo";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ShippingBadge } from "@/components/ShippingBadge";
import {
  SearchFormFields,
  type Period,
  type ShippingFilter,
  PERIOD_OPTIONS,
  getPeriodLabel,
} from "@/components/SearchFormFields";
import { MOCK_RESULT } from "@/lib/mock-data";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { SourceResult } from "@/lib/types";
import {
  formatYen,
  formatCount,
  buildPlatformSearchUrl,
} from "@/lib/utils";
import { RelativeDate } from "@/components/RelativeDate";
import { RefineKeywordSuggestions } from "@/components/RefineKeywordSuggestions";
import {
  searchKeyFromKeyword,
  setMemo,
  setPinned,
  useMemoValue,
  usePinnedValue,
  setListingPinned,
  useListingPinnedValue,
  useListingMemoValue,
  haptic,
  saveScrollPosition,
  restoreScrollPosition,
  setLastResultUrl,
} from "@/lib/storage";
import { toast } from "@/lib/toast";
import {
  CONDITION_RANKS,
  CONDITION_META,
  classifyCondition,
  type ConditionRank,
} from "@/lib/conditions";
import { generateSuggestions } from "@/lib/suggestions";
import { ConditionBadge } from "@/components/ConditionBadge";
import { ToolsPanel } from "@/components/ToolsPanel";
import { addCompletedItem, useIsInList } from "@/lib/list";
import { ShareButton } from "@/components/share/ShareButton";
import { ListPlus, ListChecks } from "lucide-react";
import { QuickMemoModal } from "@/components/QuickMemoModal";
import { PlatformPriceBars } from "@/components/PlatformPriceBars";
import {
  SOURCES,
  getStoreLabel,
  type SourceKey,
  type Listing,
  type ShippingType,
} from "@/lib/types";

type FlatListing = Listing & { source: SourceKey };
type SortMode = "date_desc" | "date_asc" | "price_desc" | "price_asc";
type PageSize = 10 | 20 | 50 | "all";

const PAGE_SIZE_OPTIONS: { value: PageSize; label: string }[] = [
  { value: 10, label: "10件" },
  { value: 20, label: "20件" },
  { value: 50, label: "50件" },
  { value: "all", label: "全件" },
];

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function ResultInner({ resultId }: { resultId: string }) {
  const params = useSearchParams();
  const router = useRouter();

  const sourcesParam = params.get("sources");
  const requestedSources = useMemo<SourceKey[]>(
    () =>
      sourcesParam
        ? (sourcesParam.split(",") as SourceKey[])
        : ["yahoo_auction"],
    [sourcesParam]
  );

  const keyword = params.get("keyword") ?? MOCK_RESULT.query.keyword;
  const period = params.get("period") ?? MOCK_RESULT.query.period;
  const mockMode = params.get("mock");
  const excludesParam = params.get("excludes") ?? "";
  const listingStatusParam = (params.get("listingStatus") as
    | "sold"
    | "active"
    | null) ?? "sold";
  const searchKey = searchKeyFromKeyword(keyword);

  // ---- 実スクレイピング ----
  const yahooEnabled =
    requestedSources.includes("yahoo_auction") &&
    mockMode !== "force" &&
    !!keyword.trim();
  const mercariEnabled =
    requestedSources.includes("mercari") &&
    mockMode !== "force" &&
    !!keyword.trim();
  const jimotyEnabled =
    requestedSources.includes("jimoty") &&
    mockMode !== "force" &&
    !!keyword.trim();

  const yahooQuery = useInfiniteQuery({
    queryKey: ["scrape_yahoo", keyword, excludesParam, listingStatusParam],
    initialPageParam: 1 as number,
    queryFn: async ({ pageParam }): Promise<SourceResult> => {
      const res = await fetch("/api/scrape/yahoo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          excludes: excludesParam || undefined,
          status: listingStatusParam,
          page: pageParam,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "ヤフオク取得に失敗");
      }
      const data = (await res.json()) as { result: SourceResult };
      return data.result;
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasNextPage ? allPages.length + 1 : undefined,
    enabled: yahooEnabled,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const mercariQuery = useInfiniteQuery({
    queryKey: ["scrape_mercari", keyword, excludesParam, listingStatusParam],
    initialPageParam: "" as string,
    queryFn: async ({ pageParam }): Promise<SourceResult> => {
      const res = await fetch("/api/scrape/mercari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          excludes: excludesParam || undefined,
          status: listingStatusParam,
          pageToken: pageParam,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "メルカリ取得に失敗");
      }
      const data = (await res.json()) as { result: SourceResult };
      return data.result;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage && lastPage.nextPageToken
        ? lastPage.nextPageToken
        : undefined,
    enabled: mercariEnabled,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const jimotyQuery = useInfiniteQuery({
    queryKey: ["scrape_jimoty", keyword, excludesParam],
    initialPageParam: 1 as number,
    queryFn: async ({ pageParam }): Promise<SourceResult> => {
      const res = await fetch("/api/scrape/jimoty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          excludes: excludesParam || undefined,
          page: pageParam,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "ジモティー取得に失敗");
      }
      const data = (await res.json()) as { result: SourceResult };
      return data.result;
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasNextPage ? allPages.length + 1 : undefined,
    enabled: jimotyEnabled,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // 全ページの listings を結合 + 集計再計算
  function mergePages(
    source: SourceResult["source"],
    pages: SourceResult[] | undefined,
  ): SourceResult | undefined {
    if (!pages || pages.length === 0) return undefined;
    const allListings = pages.flatMap((p) => p.listings);
    const prices = allListings.map((l) => l.price).sort((a, b) => a - b);
    const count = allListings.length;
    if (count === 0) {
      return {
        source,
        count: 0,
        median: 0,
        min: 0,
        max: 0,
        listings: [],
        totalAvailable: pages[0].totalAvailable,
        hasNextPage: pages[pages.length - 1].hasNextPage,
      };
    }
    const median =
      count % 2 === 1
        ? prices[Math.floor(count / 2)]
        : Math.round((prices[count / 2 - 1] + prices[count / 2]) / 2);
    return {
      source,
      count,
      median,
      min: prices[0],
      max: prices[count - 1],
      listings: allListings,
      totalAvailable: pages[0].totalAvailable,
      hasNextPage: pages[pages.length - 1].hasNextPage,
      nextPageToken: pages[pages.length - 1].nextPageToken,
    };
  }

  const yahooMerged = mergePages("yahoo_auction", yahooQuery.data?.pages);
  const mercariMerged = mergePages("mercari", mercariQuery.data?.pages);
  const jimotyMerged = mergePages("jimoty", jimotyQuery.data?.pages);

  const result = useMemo(() => {
    if (
      mockMode === "force" ||
      (!yahooEnabled && !mercariEnabled && !jimotyEnabled)
    ) {
      return MOCK_RESULT;
    }
    return {
      ...MOCK_RESULT,
      query: { ...MOCK_RESULT.query, keyword },
      productGuess: keyword,
      sources: MOCK_RESULT.sources.map((s) => {
        if (s.source === "yahoo_auction" && yahooMerged) return yahooMerged;
        if (s.source === "mercari" && mercariMerged) return mercariMerged;
        if (s.source === "jimoty" && jimotyMerged) return jimotyMerged;
        return s;
      }),
    };
  }, [
    yahooMerged,
    mercariMerged,
    jimotyMerged,
    mockMode,
    yahooEnabled,
    mercariEnabled,
    jimotyEnabled,
    keyword,
  ]);

  const yahooError = yahooQuery.isError
    ? yahooQuery.error instanceof Error
      ? yahooQuery.error.message
      : "ヤフオク取得に失敗"
    : null;
  const yahooLoading = yahooQuery.isLoading || yahooQuery.isFetching;
  const mercariError = mercariQuery.isError
    ? mercariQuery.error instanceof Error
      ? mercariQuery.error.message
      : "メルカリ取得に失敗"
    : null;
  const mercariLoading = mercariQuery.isLoading || mercariQuery.isFetching;
  const jimotyError = jimotyQuery.isError
    ? jimotyQuery.error instanceof Error
      ? jimotyQuery.error.message
      : "ジモティー取得に失敗"
    : null;
  const jimotyLoading = jimotyQuery.isLoading || jimotyQuery.isFetching;

  const memo = useMemoValue(searchKey);
  const pinned = usePinnedValue(searchKey);
  const [memoDraft, setMemoDraft] = useState<string | null>(null);
  const [memoEditing, setMemoEditing] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | SourceKey>("all");
  const [sort, setSort] = useState<SortMode>("date_desc");
  const [refine, setRefine] = useState("");
  const [refineOpen, setRefineOpen] = useState(false);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [extraPages, setExtraPages] = useState(0);
  const [lightbox, setLightbox] = useState<{ src: string } | null>(null);
  const [memoModal, setMemoModal] = useState<FlatListing | null>(null);
  const [compact, setCompact] = useState(false);

  // スクロール位置の保存・復元
  const scrollKey = useMemo(
    () => `result:${resultId}:${params.toString()}`,
    [resultId, params]
  );

  useEffect(() => {
    restoreScrollPosition(scrollKey);
    const onSave = () => saveScrollPosition(scrollKey);
    window.addEventListener("beforeunload", onSave);
    // 直近の検索結果 URL を記録
    if (typeof window !== "undefined") {
      const url = window.location.pathname + window.location.search;
      setLastResultUrl(url);
    }
    return () => {
      saveScrollPosition(scrollKey);
      window.removeEventListener("beforeunload", onSave);
    };
  }, [scrollKey]);
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const shippingParam = params.get("shipping") as ShippingFilter | null;
  const initialShipping: ShippingFilter =
    shippingParam === "free" || shippingParam === "paid" ? shippingParam : "any";
  const [shippingFilter, setShippingFilter] =
    useState<ShippingFilter>(initialShipping);

  // ストア / 個人 出品者種別フィルタ
  type SellerTypeFilter = "all" | "store" | "individual";
  const sellerTypeParam = params.get("sellerType") as SellerTypeFilter | null;
  const initialSellerType: SellerTypeFilter =
    sellerTypeParam === "store" || sellerTypeParam === "individual"
      ? sellerTypeParam
      : "all";
  const [sellerTypeFilter, setSellerTypeFilter] =
    useState<SellerTypeFilter>(initialSellerType);

  const conditionsParam = params.get("conditions");
  const initialConditions = useMemo<ConditionRank[]>(
    () =>
      conditionsParam
        ? (conditionsParam.split(",") as ConditionRank[]).filter((c) =>
            CONDITION_RANKS.includes(c as Exclude<ConditionRank, "unknown">)
          )
        : [],
    [conditionsParam]
  );
  const [conditionFilter, setConditionFilter] =
    useState<ConditionRank[]>(initialConditions);

  function toggleConditionFilter(rank: ConditionRank) {
    setConditionFilter((prev) =>
      prev.includes(rank) ? prev.filter((r) => r !== rank) : [...prev, rank]
    );
    setExtraPages(0);
  }

  // Mock failure simulation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const failedSources: SourceKey[] = mockMode === "error" ? ["mercari"] : [];

  const flatListings: FlatListing[] = useMemo(() => {
    if (mockMode === "empty") return [];
    return result.sources
      .filter(
        (s) =>
          requestedSources.includes(s.source) &&
          !failedSources.includes(s.source)
      )
      .flatMap((s) => s.listings.map((l) => ({ ...l, source: s.source })));
  }, [result, requestedSources, mockMode, failedSources]);

  const filteredListings = useMemo(() => {
    let list = flatListings;
    if (filter !== "all") {
      list = list.filter((l) => l.source === filter);
    }
    // 期間フィルタ (endedAt が period 日以内かどうか)
    if (period !== "all") {
      const days = Number(period);
      if (Number.isFinite(days) && days > 0) {
        // eslint-disable-next-line react-hooks/purity
        const threshold = Date.now() - days * 86400000;
        list = list.filter((l) => {
          if (!l.endedAt) return true; // 期間不明はそのまま含める
          const t = new Date(l.endedAt).getTime();
          return Number.isFinite(t) && t >= threshold;
        });
      }
    }
    if (conditionFilter.length > 0) {
      list = list.filter((l) =>
        conditionFilter.includes(classifyCondition(l.condition))
      );
    }
    if (shippingFilter === "free") {
      list = list.filter(
        (l) => l.shipping === "free" || l.shipping === "pickup"
      );
    } else if (shippingFilter === "paid") {
      list = list.filter((l) => l.shipping === "paid");
    }
    if (sellerTypeFilter === "store") {
      list = list.filter((l) => l.sellerType === "store");
    } else if (sellerTypeFilter === "individual") {
      // 未設定 (undefined) は個人扱いとする (デフォルトは個人と仮定)
      list = list.filter((l) => l.sellerType !== "store");
    }
    if (refine.trim()) {
      const terms = refine
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      list = list.filter((l) => {
        const title = l.title.toLowerCase();
        return terms.every((t) => !title.includes(t));
      });
    }
    return [...list].sort((a, b) => {
      if (sort === "date_desc")
        return new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime();
      if (sort === "date_asc")
        return new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime();
      if (sort === "price_desc") return b.price - a.price;
      return a.price - b.price;
    });
  }, [
    flatListings,
    filter,
    conditionFilter,
    shippingFilter,
    sellerTypeFilter,
    refine,
    sort,
    period,
  ]);

  const visibleCount =
    pageSize === "all"
      ? filteredListings.length
      : pageSize * (1 + extraPages);
  const visibleListings = filteredListings.slice(0, visibleCount);
  const hasMore = visibleCount < filteredListings.length;

  // 各媒体に未取得の次ページがあるか
  const sourcesWithMore = [
    yahooQuery.hasNextPage && yahooEnabled,
    mercariQuery.hasNextPage && mercariEnabled,
    jimotyQuery.hasNextPage && jimotyEnabled,
  ].filter(Boolean).length;
  const isFetchingMore =
    yahooQuery.isFetchingNextPage ||
    mercariQuery.isFetchingNextPage ||
    jimotyQuery.isFetchingNextPage;

  // 全ソースに次ページがある場合に呼ぶ
  function fetchNextAll() {
    if (yahooQuery.hasNextPage) yahooQuery.fetchNextPage();
    if (mercariQuery.hasNextPage) mercariQuery.fetchNextPage();
    if (jimotyQuery.hasNextPage) jimotyQuery.fetchNextPage();
  }

  const summary = useMemo(() => {
    const prices = filteredListings.map((l) => l.price);
    return {
      median: median(prices),
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
      totalCount: filteredListings.length,
    };
  }, [filteredListings]);

  // 媒体側に存在する総件数 (取得した分とは別)
  const totalAvailableSum = useMemo(() => {
    return result.sources
      .filter(
        (s) =>
          requestedSources.includes(s.source) &&
          (filter === "all" || filter === s.source),
      )
      .reduce((sum, s) => sum + (s.totalAvailable ?? 0), 0);
  }, [result.sources, requestedSources, filter]);
  const fetchedSum = useMemo(() => {
    return result.sources
      .filter(
        (s) =>
          requestedSources.includes(s.source) &&
          (filter === "all" || filter === s.source),
      )
      .reduce((sum, s) => sum + s.listings.length, 0);
  }, [result.sources, requestedSources, filter]);

  const queryStr = new URLSearchParams(params.toString()).toString();
  const isEmpty = flatListings.length === 0;
  const hasNoMatch = !isEmpty && filteredListings.length === 0;

  const inList = useIsInList(keyword);

  function handleAddToList() {
    if (isEmpty || summary.totalCount === 0) {
      toast({ message: "結果がないためリストに追加できません", variant: "error" });
      return;
    }
    addCompletedItem(
      {
        keyword,
        excludes: params.get("excludes") ?? undefined,
        period: period as Period,
        sources: requestedSources,
        conditions: conditionFilter.filter(
          (c): c is Exclude<ConditionRank, "unknown"> => c !== "unknown"
        ),
        shipping: shippingFilter,
      },
      {
        median: summary.median,
        min: summary.min,
        max: summary.max,
        count: summary.totalCount,
        suggestedBuyPrice: Math.round((summary.median * 70) / 100),
      }
    );
    haptic(8);
    toast({
      message: `「${keyword}」を査定リストに追加`,
      actionLabel: "リストを見る",
      actionHref: "/list",
    });
  }

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({ message: "URLをコピーしました" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ message: "コピーに失敗しました", variant: "error" });
    }
  }

  async function handleShare() {
    const url = window.location.href;
    const title = `マクサスサーチ: ${keyword}`;
    const text = `「${keyword}」の相場検索結果`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // user cancelled, fall through to copy
      }
    }
    await handleCopyUrl();
  }

  function startMemoEdit() {
    setMemoDraft(memo);
    setMemoEditing(true);
  }

  function saveMemo() {
    if (memoDraft !== null) setMemo(searchKey, memoDraft);
    haptic(8);
    toast({
      message: memoDraft?.trim() ? "メモを保存しました" : "メモを削除しました",
    });
    setMemoEditing(false);
    setMemoDraft(null);
  }

  function cancelMemoEdit() {
    setMemoEditing(false);
    setMemoDraft(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 商品の特定結果 */}
      <section className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2 min-w-0">
            <Sparkles size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-muted">商品の特定結果</div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !pinned;
              setPinned(searchKey, next);
              haptic(8);
              toast({
                message: next ? "検索をピン留めしました" : "ピンを外しました",
                actionLabel: next ? "履歴で見る" : undefined,
                actionHref: next ? "/history" : undefined,
              });
            }}
            aria-label={pinned ? "ピンを外す" : "ピン留め"}
            className={
              pinned
                ? "tap-scale shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-pin/10 text-pin"
                : "tap-scale shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-surface-2"
            }
          >
            <Star
              size={18}
              fill={pinned ? "currentColor" : "none"}
              className={pinned ? "pin-anim" : ""}
              key={String(pinned)}
            />
          </button>
        </div>
        <h2 className="text-base font-bold text-foreground">
          {isEmpty ? keyword : result.productGuess}
        </h2>
        <div className="text-xs text-muted mt-1">
          検索: {keyword} ・ {period === "all" ? "全期間" : `直近${getPeriodLabel(period as Period)}`}
        </div>
        {yahooLoading && yahooEnabled && (
          <div className="mt-2 text-xs text-primary flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            ヤフオクから最新の落札相場を取得中...
          </div>
        )}
        {yahooError && (
          <div className="mt-2 text-xs text-warning flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>ヤフオク取得失敗: {yahooError}（モックデータを表示中）</span>
          </div>
        )}
        {mercariLoading && mercariEnabled && (
          <div className="mt-2 text-xs text-primary flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            メルカリから売切相場を取得中...
          </div>
        )}
        {mercariError && (
          <div className="mt-2 text-xs text-warning flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>メルカリ取得失敗: {mercariError}（モックデータを表示中）</span>
          </div>
        )}
        {jimotyLoading && jimotyEnabled && (
          <div className="mt-2 text-xs text-primary flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            ジモティーから出品中の相場を取得中...
          </div>
        )}
        {jimotyError && (
          <div className="mt-2 text-xs text-warning flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>ジモティー取得失敗: {jimotyError}（モックデータを表示中）</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setEditOpen(!editOpen)}
          className="mt-3 w-full h-9 rounded-lg border border-border bg-surface-2 text-foreground text-xs font-medium hover:border-primary/40 hover:text-primary flex items-center justify-center gap-1.5"
        >
          <SlidersHorizontal size={14} />
          検索条件を変更
          {editOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </section>

      {/* インライン検索条件編集 */}
      {editOpen && (
        <section className="bg-surface border border-border rounded-xl p-4">
          <SearchFormFields
            initial={{
              keyword,
              excludes: params.get("excludes") ?? "",
              period: period as Period,
              sources: requestedSources,
              conditions: conditionFilter.filter(
                (c): c is Exclude<ConditionRank, "unknown"> => c !== "unknown"
              ),
              shipping: shippingFilter,
            }}
            submitLabel="この条件で再検索"
            onAfterSubmit={() => setEditOpen(false)}
          />
        </section>
      )}

      {/* サマリー */}
      {!isEmpty && (
        <section className="bg-gradient-to-br from-primary to-accent text-primary-foreground rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3 opacity-90">
            <BarChart3 size={16} />
            <span className="text-xs font-medium">
              {filter === "all"
                ? "統合サマリー"
                : `${SOURCES.find((s) => s.key === filter)?.name}サマリー`}
              {refine.trim() && " (絞り込み後)"}
            </span>
          </div>
          {summary.totalCount > 0 ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight">
                  {formatYen(summary.median)}
                </span>
                <span className="text-sm opacity-90">中央値</span>
              </div>
              <div className="mt-2 text-sm opacity-90">
                {formatYen(summary.min)} 〜 {formatYen(summary.max)}
                <span className="ml-2 text-xs">
                  ({formatCount(summary.totalCount)})
                </span>
              </div>
              {totalAvailableSum > 0 && totalAvailableSum > fetchedSum && (
                <div className="mt-1 text-[11px] opacity-80">
                  媒体側に {formatCount(totalAvailableSum)} 存在 (うち{" "}
                  {fetchedSum}件取得)
                </div>
              )}
              {totalAvailableSum > 0 && totalAvailableSum === fetchedSum && (
                <div className="mt-1 text-[11px] opacity-80">
                  媒体側に {formatCount(fetchedSum)}以上 存在
                </div>
              )}
            </>
          ) : (
            <p className="text-sm opacity-90">
              絞り込み条件に一致する結果がありません
            </p>
          )}
        </section>
      )}

      {/* 媒体別の価格分布 */}
      {!isEmpty && requestedSources.length > 1 && (
        <PlatformPriceBars listings={flatListings} />
      )}

      {/* 媒体別検索リンク */}
      {!isEmpty && (
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2 px-1">
            媒体ページで全件を見る
          </h3>
          <div className="flex flex-col gap-2">
            {requestedSources.map((key) => {
              const meta = SOURCES.find((s) => s.key === key)!;
              const url = buildPlatformSearchUrl(key, keyword);
              const failed = failedSources.includes(key);
              return (
                <div key={key}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-4 h-12 rounded-lg bg-surface border-2 hover:bg-surface-2 active:bg-surface-2 transition-colors"
                    style={{ borderColor: `${meta.color}33` }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <PlatformLogo source={key} size={20} />
                      <span
                        className="text-sm font-semibold truncate"
                        style={{ color: meta.color }}
                      >
                        {meta.name}で「{keyword}」を見る
                      </span>
                      {failed && (
                        <span className="shrink-0 text-xs text-danger flex items-center gap-0.5">
                          <AlertTriangle size={12} />
                          取得失敗
                        </span>
                      )}
                    </div>
                    <ExternalLink
                      size={16}
                      style={{ color: meta.color }}
                      className="shrink-0"
                    />
                  </a>
                  {key === "jimoty" && (
                    <p className="text-[10px] text-muted mt-1 px-4">
                      ※ 出品中の希望価格（売却済み価格は非公開）
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 取得失敗の警告 */}
      {failedSources.length > 0 && (
        <section className="bg-warning/10 border border-warning/30 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
          <p className="text-xs text-foreground leading-relaxed">
            一部の媒体（
            {failedSources
              .map((s) => SOURCES.find((x) => x.key === s)?.name)
              .join("・")}
            ）からデータが取得できませんでした。表示は他の媒体のみの結果です。
          </p>
        </section>
      )}

      {/* 絞り込みキーワード提案 (件数が多すぎる時) */}
      {!isEmpty && totalAvailableSum > 100 && totalAvailableSum > fetchedSum && (
        <RefineKeywordSuggestions
          resultId={resultId}
          keyword={keyword}
          totalAvailable={totalAvailableSum}
          sampleTitles={flatListings.slice(0, 30).map((l) => l.title)}
          baseQueryParams={params}
        />
      )}

      {/* 査定ツールパネル（AI / 計算機 / 提案を統合） */}
      {!isEmpty && (
        <ToolsPanel
          keyword={keyword}
          productGuess={result.productGuess}
          listings={flatListings}
          defaultBase={summary.median}
          suggestionsContent={
            <SuggestionsContent
              listings={flatListings}
              keyword={keyword}
              onAdd={(term) => {
                const next = new URLSearchParams(params.toString());
                next.set("keyword", `${keyword} ${term}`.trim());
                router.push(`/search/loading?${next.toString()}`);
              }}
              onExclude={(term) => {
                setRefine((prev) =>
                  prev.trim() ? `${prev} ${term}` : term
                );
                setRefineOpen(true);
                setExtraPages(0);
              }}
            />
          }
        />
      )}

      {/* スティッキー中央値バー（一覧表示時に常時表示） */}
      {!isEmpty && summary.totalCount > 0 && (
        <div className="sticky top-14 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[10px] text-muted">中央値</span>
              <span className="text-base font-bold text-foreground truncate">
                {formatYen(summary.median)}
              </span>
              <span className="text-[10px] text-muted shrink-0">
                · {formatCount(summary.totalCount)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCompact(!compact)}
              aria-label={compact ? "通常表示に戻す" : "コンパクト表示"}
              className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium text-muted hover:text-foreground hover:bg-surface-2"
            >
              {compact ? "通常表示" : "コンパクト表示"}
            </button>
          </div>
        </div>
      )}

      {/* 一覧コントロール */}
      {!isEmpty && (
        <section>
          <div className="flex items-center justify-between mb-1 px-1">
            <h3 className="text-sm font-semibold text-foreground">
              落札・売切一覧
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRefineOpen(!refineOpen)}
                aria-label="絞り込み"
                className={
                  refineOpen || refine.trim()
                    ? "h-7 px-2 rounded text-xs font-medium border-2 border-primary text-primary bg-primary/5 flex items-center gap-1"
                    : "h-7 px-2 rounded text-xs text-muted hover:text-foreground flex items-center gap-1"
                }
              >
                <Filter size={12} />
                絞り込み
              </button>
              <SortDropdown sort={sort} onChange={setSort} />
            </div>
          </div>

          {refineOpen && (
            <div className="mb-2 flex gap-2">
              <input
                type="text"
                value={refine}
                onChange={(e) => {
                  setRefine(e.target.value);
                  setExtraPages(0);
                }}
                placeholder="さらに除外（スペース区切り）例: ジャンク 部品"
                className="flex-1 h-10 px-3 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                autoFocus
              />
              {refine && (
                <button
                  type="button"
                  onClick={() => setRefine("")}
                  className="w-10 h-10 rounded-lg border border-border text-muted hover:bg-surface-2 flex items-center justify-center"
                  aria-label="クリア"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          {requestedSources.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-1 scrollbar-none">
              <FilterChip
                active={filter === "all"}
                onClick={() => {
                  setFilter("all");
                  setExtraPages(0);
                }}
                label={`全て (${flatListings.length})`}
              />
              {requestedSources
                .filter((k) => !failedSources.includes(k))
                .map((key) => {
                  const meta = SOURCES.find((s) => s.key === key)!;
                  const count = flatListings.filter(
                    (l) => l.source === key
                  ).length;
                  const tabName = key === "jimoty"
                    ? `${meta.shortName}(参考) (${count})`
                    : `${meta.shortName} (${count})`;
                  return (
                    <FilterChip
                      key={key}
                      active={filter === key}
                      onClick={() => {
                        setFilter(key);
                        setExtraPages(0);
                      }}
                      label={tabName}
                      color={meta.color}
                    />
                  );
                })}
            </div>
          )}

          <div className="bg-surface-2 rounded-lg overflow-hidden mb-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-[11px] hover:bg-surface-2/60"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Filter size={12} className="text-muted shrink-0" />
                <span className="text-muted">期間</span>
                <span className="font-semibold text-foreground">
                  {getPeriodLabel(period as Period)}
                </span>
                <span className="text-muted">/ 送料</span>
                <span className="font-semibold text-foreground">
                  {shippingFilter === "any"
                    ? "全て"
                    : shippingFilter === "free"
                      ? "無料"
                      : "別"}
                </span>
                <span className="text-muted">/ 状態</span>
                <span className="font-semibold text-foreground truncate">
                  {conditionFilter.length === 0
                    ? "全て"
                    : conditionFilter.join(",")}
                </span>
                <span className="text-muted">/ 出品者</span>
                <span className="font-semibold text-foreground truncate">
                  {sellerTypeFilter === "all"
                    ? "全て"
                    : sellerTypeFilter === "store"
                      ? "ストア"
                      : "個人"}
                </span>
              </div>
              {filtersOpen ? (
                <ChevronUp size={14} className="text-muted shrink-0" />
              ) : (
                <ChevronDown size={14} className="text-muted shrink-0" />
              )}
            </button>

            {filtersOpen && (
              <div className="border-t border-border p-2">
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-1 scrollbar-none items-center">
                  <span className="shrink-0 text-[10px] text-muted px-1">
                    期間:
                  </span>
                  {PERIOD_OPTIONS.map((opt) => {
                    const active = period === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => {
                          if (opt.v === period) return;
                          const next = new URLSearchParams(params.toString());
                          next.set("period", opt.v);
                          router.push(`/search/loading?${next.toString()}`);
                        }}
                        className={
                          active
                            ? "shrink-0 h-7 px-2.5 rounded-full text-[11px] font-bold border-2 border-primary bg-primary/5 text-primary"
                            : "shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border bg-surface text-muted hover:border-foreground/30"
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-1 scrollbar-none items-center">
                  <span className="shrink-0 text-[10px] text-muted px-1">
                    送料:
                  </span>
                  {(
                    [
                      { v: "any", label: "全て" },
                      { v: "free", label: "送料無料・引取" },
                      { v: "paid", label: "送料別" },
                    ] as { v: ShippingFilter; label: string }[]
                  ).map((opt) => {
                    const active = shippingFilter === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => {
                          setShippingFilter(opt.v);
                          setExtraPages(0);
                        }}
                        className={
                          active
                            ? "shrink-0 h-7 px-2.5 rounded-full text-[11px] font-bold border-2 border-success bg-success/5 text-success"
                            : "shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border bg-surface text-muted hover:border-foreground/30"
                        }
                        style={
                          active
                            ? {
                                borderColor: "var(--success)",
                                color: "var(--success)",
                              }
                            : undefined
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-1 scrollbar-none items-center">
                  <span className="shrink-0 text-[10px] text-muted px-1">
                    出品者:
                  </span>
                  {(
                    [
                      { v: "all", label: "全て" },
                      { v: "store", label: "ストア (法人/Shops)" },
                      { v: "individual", label: "個人" },
                    ] as { v: SellerTypeFilter; label: string }[]
                  ).map((opt) => {
                    const active = sellerTypeFilter === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => {
                          setSellerTypeFilter(opt.v);
                          setExtraPages(0);
                        }}
                        className={
                          active
                            ? "shrink-0 h-7 px-2.5 rounded-full text-[11px] font-bold border-2 border-primary bg-primary/5 text-primary"
                            : "shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium border border-border bg-surface text-muted hover:border-foreground/30"
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2 overflow-x-auto -mx-1 px-1 scrollbar-none items-center">
                  <span className="shrink-0 text-[10px] text-muted px-1">
                    状態:
                  </span>
                  {CONDITION_RANKS.map((r) => {
                    const meta = CONDITION_META[r];
                    const count = flatListings.filter(
                      (l) => classifyCondition(l.condition) === r
                    ).length;
                    const active = conditionFilter.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleConditionFilter(r)}
                        className={
                          active
                            ? "shrink-0 h-7 px-2 rounded-full text-[11px] font-bold border-2 transition-colors flex items-center gap-1"
                            : "shrink-0 h-7 px-2 rounded-full text-[11px] font-medium border border-border bg-surface text-muted hover:border-foreground/30 flex items-center gap-1"
                        }
                        style={
                          active
                            ? {
                                borderColor: meta.color,
                                color: meta.color,
                                backgroundColor: `${meta.color}10`,
                              }
                            : undefined
                        }
                      >
                        <span
                          className="inline-flex items-center justify-center w-4 h-4 rounded text-white text-[9px] font-black"
                          style={{ backgroundColor: meta.color }}
                        >
                          {meta.label}
                        </span>
                        ({count})
                      </button>
                    );
                  })}
                  {conditionFilter.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConditionFilter([])}
                      className="shrink-0 h-7 px-2 rounded-full text-[11px] text-muted hover:text-foreground"
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="text-[10px] text-muted px-1 mb-2 flex items-center gap-1">
            <StickyNote size={10} />
            ヒント: カードをダブルタップで査定メモを追加できます
          </div>

          <div
            className={
              compact
                ? "flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3"
                : "flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3"
            }
          >
            {visibleListings.map((l, idx) => (
              <ListingCard
                key={`${l.source}-${l.id}`}
                listing={l}
                detailHref={`/search/result/${resultId}/listing/${l.source}-${l.id}?${queryStr}&rank=${idx + 1}`}
                onLightbox={(src) => setLightbox({ src })}
                onMemoOpen={() => setMemoModal(l)}
                compact={compact}
              />
            ))}

            {hasNoMatch && (
              <div className="bg-surface border border-border rounded-xl p-8 text-center">
                <Inbox className="text-muted mx-auto mb-2" size={28} />
                <p className="text-sm text-muted">
                  絞り込み条件に一致する結果がありません
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRefine("");
                    setFilter("all");
                  }}
                  className="text-xs text-primary hover:underline mt-2"
                >
                  絞り込みをクリア
                </button>
              </div>
            )}

            {hasMore && (
              <button
                type="button"
                onClick={() => setExtraPages((c) => c + 1)}
                className="h-12 rounded-lg border border-border bg-surface text-foreground text-sm font-medium hover:bg-surface-2 transition-colors"
              >
                もっと見る ({filteredListings.length - visibleCount}件)
              </button>
            )}

            {!hasMore && sourcesWithMore > 0 && (
              <button
                type="button"
                onClick={fetchNextAll}
                disabled={isFetchingMore}
                className="h-12 rounded-lg border border-primary bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors disabled:opacity-60"
              >
                {isFetchingMore
                  ? "取得中..."
                  : `次のページから追加取得 (${sourcesWithMore}媒体)`}
              </button>
            )}

            {filteredListings.length > 0 && (
              <div className="flex items-center justify-center gap-2 mt-2 text-xs">
                <span className="text-muted">表示件数:</span>
                <div className="flex gap-1">
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setPageSize(opt.value);
                        setExtraPages(0);
                      }}
                      className={
                        pageSize === opt.value
                          ? "h-7 px-2.5 rounded-full text-xs font-semibold border-2 border-primary bg-primary/5 text-primary"
                          : "h-7 px-2.5 rounded-full text-xs text-foreground border border-border bg-surface hover:border-foreground/30"
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <span className="text-muted ml-1">
                  / {filteredListings.length}件中
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 完全に空 */}
      {isEmpty && (
        <section className="bg-surface border border-border rounded-xl p-8 text-center">
          <Inbox className="text-muted mx-auto mb-3" size={36} />
          <p className="text-sm font-semibold text-foreground mb-1">
            検索結果が見つかりませんでした
          </p>
          <p className="text-xs text-muted leading-relaxed">
            キーワードを変えるか、媒体・期間を広げて再検索してみてください。
          </p>
          <Link
            href={`/search?${queryStr}`}
            className="inline-block mt-4 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium leading-10"
          >
            検索条件を変更
          </Link>
        </section>
      )}

      {/* アクション */}
      {!isEmpty && (
        <section className="pt-2">
          <button
            type="button"
            onClick={handleAddToList}
            disabled={inList}
            className={
              inList
                ? "tap-scale w-full h-12 rounded-lg bg-success/10 border border-success/30 text-success font-semibold text-sm flex items-center justify-center gap-2"
                : "tap-scale w-full h-12 rounded-lg bg-surface border-2 border-primary text-primary font-semibold text-sm hover:bg-primary/5 flex items-center justify-center gap-2"
            }
          >
            {inList ? (
              <>
                <ListChecks size={16} />
                査定リストに追加済み
              </>
            ) : (
              <>
                <ListPlus size={16} />
                この検索を査定リストに追加
              </>
            )}
          </button>
        </section>
      )}

      <section className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleShare}
          className="tap-scale h-12 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 flex items-center justify-center gap-2"
        >
          <Share2 size={16} />
          共有
        </button>
        <button
          type="button"
          onClick={handleCopyUrl}
          className={
            copied
              ? "h-12 rounded-lg bg-success text-white font-medium text-sm flex items-center justify-center gap-2"
              : "h-12 rounded-lg border border-border bg-surface text-foreground font-medium text-sm hover:border-foreground/30 flex items-center justify-center gap-2"
          }
        >
          {copied ? (
            <>
              <Check size={16} />
              コピーしました
            </>
          ) : (
            <>
              <Link2 size={16} />
              URLをコピー
            </>
          )}
        </button>
      </section>

      {/* 共有リンク発行 */}
      <div className="flex justify-center">
        <ShareButton
          resourceType="search"
          resourceId={resultId}
          className="tap-scale w-full h-10 text-sm justify-center"
        />
      </div>

      {/* 検索メモ（ページ下部） */}
      <section className="bg-surface border border-border rounded-xl p-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <StickyNote size={16} className="text-warning" />
            <span className="text-sm font-semibold text-foreground">
              検索メモ
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
              placeholder="例: 〇〇宅で査定。状態Bで¥80,000で成約"
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
            この検索にメモを残せます。履歴ページから一覧で確認できます。
          </p>
        )}
      </section>

      <section className="bg-surface-2 rounded-xl p-3 mt-2 flex items-start gap-2">
        <Check size={14} className="text-success mt-0.5 shrink-0" />
        <p className="text-xs text-muted leading-relaxed">
          検索結果は履歴に自動保存されています。このページのURLを共有すれば、
          社内の他のスタッフも同じ結果を確認できます。
        </p>
      </section>

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          onClose={() => setLightbox(null)}
        />
      )}

      {memoModal && (
        <QuickMemoModal
          ref={`${memoModal.source}-${memoModal.id}`}
          title={memoModal.title}
          thumbnail={memoModal.thumbnail}
          price={memoModal.price}
          onClose={() => setMemoModal(null)}
        />
      )}
    </div>
  );
}

function SuggestionsContent({
  listings,
  keyword,
  onAdd,
  onExclude,
}: {
  listings: { title: string }[];
  keyword: string;
  onAdd: (term: string) => void;
  onExclude: (term: string) => void;
}) {
  const suggestions = useMemo(
    () => generateSuggestions(listings, keyword),
    [listings, keyword]
  );

  if (listings.length < 10) {
    return (
      <div className="text-center py-6 text-sm text-muted">
        検索結果が10件未満のため、絞り込み候補は表示しません
      </div>
    );
  }
  if (suggestions.additions.length === 0 && suggestions.excludes.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted">
        現状の結果からは追加候補・除外候補が見つかりませんでした
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {suggestions.additions.length > 0 && (
        <div>
          <div className="text-[11px] text-muted mb-1.5">
            追加（タップで再検索）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.additions.map((s) => (
              <button
                key={s.term}
                type="button"
                onClick={() => onAdd(s.term)}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
              >
                + {s.term}
                <span className="text-[10px] opacity-60">{s.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {suggestions.excludes.length > 0 && (
        <div>
          <div className="text-[11px] text-muted mb-1.5">
            除外（タップで一覧から除外）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.excludes.map((s) => (
              <button
                key={s.term}
                type="button"
                onClick={() => onExclude(s.term)}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium border border-danger/30 bg-danger/5 text-danger hover:bg-danger/10"
              >
                − {s.term}
                <span className="text-[10px] opacity-60">{s.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  detailHref,
  onLightbox,
  onMemoOpen,
  compact,
}: {
  listing: FlatListing;
  detailHref: string;
  onLightbox: (src: string) => void;
  onMemoOpen: () => void;
  compact: boolean;
}) {
  const router = useRouter();
  const ref = `${listing.source}-${listing.id}`;
  const pinned = useListingPinnedValue(ref);
  const memo = useListingMemoValue(ref);
  const sourceMeta = SOURCES.find((s) => s.key === listing.source)!;
  const rank = classifyCondition(listing.condition);

  const [menuOpen, setMenuOpen] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCardTap(e: React.MouseEvent) {
    e.preventDefault();
    tapCountRef.current += 1;
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
    if (tapCountRef.current >= 2) {
      tapCountRef.current = 0;
      onMemoOpen();
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
      router.push(detailHref);
    }, 250);
  }

  function togglePin(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !pinned;
    setListingPinned(ref, next);
    haptic(8);
    toast({
      message: next ? "商品をピン留めしました" : "ピンを外しました",
      actionLabel: next ? "履歴で見る" : undefined,
      actionHref: next ? "/history" : undefined,
    });
  }

  const cardClass = pinned
    ? "tap-scale bg-surface border-2 border-pin/40 rounded-xl overflow-hidden hover:border-pin/60 hover:shadow-md transition-all duration-150"
    : "bg-surface border border-border rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-150";

  if (compact) {
    return (
      <article className={cardClass}>
        <Link
          href={detailHref}
          onClick={handleCardTap}
          className="flex items-center gap-3 p-2.5"
        >
          {listing.thumbnail ? (
            <Image
              src={listing.thumbnail}
              alt=""
              width={48}
              height={48}
              loading="lazy"
              unoptimized
              className="w-12 h-12 rounded object-cover bg-surface-2 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-surface-2 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <SourceBadge source={listing.source} />
              <ConditionBadge rank={rank} size="sm" />
              <ShippingBadge shipping={listing.shipping} size="sm" />
            </div>
            <p className="text-xs font-medium text-foreground line-clamp-1 leading-tight">
              {listing.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-bold text-foreground">
                {formatYen(listing.price)}
              </span>
              <span className="text-[10px] text-muted">
                <RelativeDate iso={listing.endedAt} />
              </span>
            </div>
            {memo && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-warning">
                <StickyNote size={10} className="shrink-0" />
                <span className="line-clamp-1">{memo}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={togglePin}
            aria-label={pinned ? "ピンを外す" : "ピン留め"}
            className={
              pinned
                ? "tap-scale shrink-0 w-9 h-9 rounded-md flex items-center justify-center bg-pin/10 text-pin"
                : "shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-muted hover:bg-surface-2"
            }
          >
            <Star size={16} fill={pinned ? "currentColor" : "none"} />
          </button>
        </Link>
      </article>
    );
  }

  return (
    <article className={cardClass}>
      <Link href={detailHref} onClick={handleCardTap} className="block">
        <div className="flex p-3 gap-3">
          {listing.thumbnail ? (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onLightbox(listing.thumbnail!);
                }}
                className="w-20 h-20 rounded-lg overflow-hidden bg-surface-2 block"
                aria-label="画像を拡大"
              >
                <Image
                  src={listing.thumbnail}
                  alt=""
                  width={80}
                  height={80}
                  loading="lazy"
                  unoptimized
                  className="w-full h-full object-cover"
                />
              </button>
              <SourceBadge
                source={listing.source}
                variant="overlay"
                className="absolute top-1 left-1"
              />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-lg bg-surface-2 shrink-0 flex items-center justify-center text-muted text-[10px]">
              画像なし
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug flex-1">
                {listing.title}
              </p>
              <div className="flex items-center gap-0.5 shrink-0 -mt-1 -mr-1">
                <button
                  type="button"
                  onClick={togglePin}
                  aria-label={pinned ? "ピンを外す" : "ピン留め"}
                  className={
                    pinned
                      ? "tap-scale w-8 h-8 rounded-md flex items-center justify-center bg-pin/10 text-pin"
                      : "w-8 h-8 rounded-md flex items-center justify-center text-muted hover:bg-surface-2"
                  }
                >
                  <Star
                    size={16}
                    fill={pinned ? "currentColor" : "none"}
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpen(!menuOpen);
                  }}
                  aria-label="メニュー"
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:bg-surface-2"
                >
                  <MoreVertical size={16} />
                </button>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
              <span className="text-xl font-bold text-foreground tracking-tight">
                {formatYen(listing.price)}
              </span>
              {listing.bidCount !== undefined && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Gavel size={12} />
                  {listing.bidCount}件
                </span>
              )}
              {listing.likes !== undefined && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Heart size={12} />
                  {listing.likes}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs flex-wrap">
              <ConditionBadge rank={rank} size="sm" />
              <ShippingBadge shipping={listing.shipping} size="sm" />
              {listing.sellerType === "store" && (
                <span className="inline-flex items-center px-1.5 h-5 rounded text-[10px] font-medium bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-200 dark:border-amber-900">
                  {getStoreLabel(listing.source)}
                </span>
              )}
              {listing.condition && (
                <span className="text-muted truncate max-w-[140px]">
                  {listing.condition}
                </span>
              )}
              <span className="text-muted ml-auto shrink-0">
                <RelativeDate iso={listing.endedAt} />
              </span>
            </div>
            {memo && (
              <div className="flex items-start gap-1.5 mt-2 p-2 rounded-md bg-warning/10 border border-warning/20">
                <StickyNote
                  size={11}
                  className="text-warning mt-0.5 shrink-0"
                />
                <p className="text-[11px] text-foreground line-clamp-2 leading-relaxed">
                  {memo}
                </p>
              </div>
            )}
          </div>
        </div>
      </Link>
      <div className="grid grid-cols-2 border-t border-border bg-surface-2/30">
        <Link
          href={detailHref}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold text-foreground hover:bg-surface-2 transition-colors"
        >
          詳細を見る
        </Link>
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold hover:bg-surface-2 transition-colors border-l border-border"
          style={{ color: sourceMeta.color }}
        >
          <PlatformLogo source={listing.source} size={14} />
          {sourceMeta.shortName}で見る
          <ExternalLink size={12} />
        </a>
      </div>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-surface border border-border rounded-xl shadow-xl py-1 min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                onMemoOpen();
              }}
              icon={<StickyNote size={14} />}
              label="メモを追加 / 編集"
            />
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                setListingPinned(ref, !pinned);
                haptic(8);
              }}
              icon={
                <Star size={14} fill={pinned ? "currentColor" : "none"} />
              }
              label={pinned ? "ピンを外す" : "ピン留め"}
            />
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                router.push(detailHref);
              }}
              icon={<ExternalLink size={14} />}
              label="詳細ページへ"
            />
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                window.open(listing.url, "_blank");
              }}
              icon={<PlatformLogo source={listing.source} size={14} />}
              label={`${sourceMeta.name}で開く`}
            />
          </div>
        </div>
      )}
    </article>
  );
}

function MenuItem({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-surface-2 text-left"
    >
      <span className="text-muted">{icon}</span>
      {label}
    </button>
  );
}

function SortDropdown({
  sort,
  onChange,
}: {
  sort: SortMode;
  onChange: (s: SortMode) => void;
}) {
  const labels: Record<SortMode, string> = {
    date_desc: "落札日 新しい順",
    date_asc: "落札日 古い順",
    price_desc: "価格 高い順",
    price_asc: "価格 安い順",
  };
  return (
    <div className="relative">
      <select
        value={sort}
        onChange={(e) => onChange(e.target.value as SortMode)}
        className="appearance-none h-7 pl-6 pr-6 rounded text-xs font-medium bg-transparent text-muted hover:text-foreground border-0 focus:outline-none cursor-pointer"
      >
        {(Object.keys(labels) as SortMode[]).map((k) => (
          <option key={k} value={k}>
            {labels[k]}
          </option>
        ))}
      </select>
      <ArrowUpDown
        size={12}
        className="absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "shrink-0 h-8 px-3 rounded-full text-xs font-semibold border-2 transition-colors"
          : "shrink-0 h-8 px-3 rounded-full text-xs font-medium border border-border text-foreground bg-surface hover:border-foreground/30"
      }
      style={
        active
          ? color
            ? {
                borderColor: color,
                color,
                backgroundColor: `${color}10`,
              }
            : {
                borderColor: "var(--primary)",
                color: "var(--primary)",
                backgroundColor: "rgba(31, 111, 235, 0.06)",
              }
          : undefined
      }
    >
      {label}
    </button>
  );
}

export default function SearchResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AppShell back={{ href: "/search", label: "検索" }} title="検索結果">
      <Suspense
        fallback={
          <div className="pt-8 text-center text-muted text-sm">
            読み込み中...
          </div>
        }
      >
        <ResultInner resultId={id} />
      </Suspense>
    </AppShell>
  );
}
