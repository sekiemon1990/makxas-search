"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Search as SearchIcon,
  Star,
  StickyNote,
  Eye,
  History as HistoryIcon,
  X as XIcon,
  Sparkles,
  Trash2,
  ListChecks,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SourceBadge } from "@/components/SourceBadge";
import { ConditionBadge } from "@/components/ConditionBadge";
import { formatYen, formatCount } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSearchHistory,
  toggleFavoriteKeyword,
  deleteSearchHistoryEntry,
} from "@/lib/api/search-keywords";
import { RelativeDate } from "@/components/RelativeDate";
import {
  searchKeyFromKeyword,
  useMemoValue,
  usePinnedValue,
  useListingMemoValue,
  useListingPinnedValue,
  useListingViews,
  useSavedAdvices,
  removeSavedAdvice,
  type ListingViewSnapshot,
  type SavedAdvice,
} from "@/lib/storage";
import { classifyCondition } from "@/lib/conditions";
import { useAllLists, useCurrentList, switchToList } from "@/lib/list";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

type Tab = "searches" | "views" | "advices" | "lists";

const DATE_GROUP_ORDER = [
  "今日",
  "昨日",
  "今週",
  "先週",
  "それ以前",
] as const;
type DateGroup = (typeof DATE_GROUP_ORDER)[number];

function groupByDate<T>(
  items: T[],
  getDate: (item: T) => string
): Record<DateGroup, T[]> {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfThisWeek = startOfToday - now.getDay() * 86400000;
  const startOfLastWeek = startOfThisWeek - 7 * 86400000;

  const groups: Record<DateGroup, T[]> = {
    今日: [],
    昨日: [],
    今週: [],
    先週: [],
    それ以前: [],
  };

  for (const item of items) {
    const t = new Date(getDate(item)).getTime();
    if (t >= startOfToday) groups["今日"].push(item);
    else if (t >= startOfYesterday) groups["昨日"].push(item);
    else if (t >= startOfThisWeek) groups["今週"].push(item);
    else if (t >= startOfLastWeek) groups["先週"].push(item);
    else groups["それ以前"].push(item);
  }

  return groups;
}

export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>("searches");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [memoOnly, setMemoOnly] = useState(false);
  const [query, setQuery] = useState("");
  // groupByDate が new Date() を使うためサーバ (UTC) とクライアント (JST) で
  // 日付境界が異なり、項目のグループ分けが変わって HTML 不一致 (#418) になる。
  // マウント後にだけリスト本体をレンダリングして回避する。
  const [mounted, setMounted] = useState(false);
  // ハイドレーション不一致回避のため mount 後にのみ render する典型パターン
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <section>
          <h2 className="text-xl font-bold text-foreground">履歴</h2>
          <p className="text-sm text-muted mt-1">
            検索や閲覧した商品を後から確認できます
          </p>
        </section>

        <div className="grid grid-cols-4 bg-surface-2 rounded-lg p-1 gap-1">
          <TabBtn
            active={tab === "searches"}
            onClick={() => setTab("searches")}
            icon={<HistoryIcon size={12} />}
            label="検索"
          />
          <TabBtn
            active={tab === "views"}
            onClick={() => setTab("views")}
            icon={<Eye size={12} />}
            label="閲覧"
          />
          <TabBtn
            active={tab === "lists"}
            onClick={() => setTab("lists")}
            icon={<ListChecks size={12} />}
            label="リスト"
          />
          <TabBtn
            active={tab === "advices"}
            onClick={() => setTab("advices")}
            icon={<Sparkles size={12} />}
            label="AI査定"
          />
        </div>

        <div className="relative">
          <SearchIcon
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="履歴を検索"
            className="w-full h-11 pl-9 pr-9 rounded-lg bg-surface border border-border text-foreground placeholder:text-muted text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="クリア"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-muted hover:bg-surface-2 flex items-center justify-center"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setPinnedOnly(false);
              setMemoOnly(false);
            }}
            className={
              !pinnedOnly && !memoOnly
                ? "shrink-0 h-8 px-3 rounded-full text-xs font-semibold border-2 border-primary bg-primary/5 text-primary"
                : "shrink-0 h-8 px-3 rounded-full text-xs font-medium border border-border text-foreground bg-surface"
            }
          >
            全て
          </button>
          <button
            type="button"
            onClick={() => setPinnedOnly(!pinnedOnly)}
            className={
              pinnedOnly
                ? "shrink-0 h-8 px-3 rounded-full text-xs font-semibold border-2 border-warning bg-warning/10 text-warning flex items-center gap-1"
                : "shrink-0 h-8 px-3 rounded-full text-xs font-medium border border-border text-foreground bg-surface flex items-center gap-1"
            }
          >
            <Star size={12} fill={pinnedOnly ? "currentColor" : "none"} />
            ピン留めのみ
          </button>
          <button
            type="button"
            onClick={() => setMemoOnly(!memoOnly)}
            className={
              memoOnly
                ? "shrink-0 h-8 px-3 rounded-full text-xs font-semibold border-2 border-primary bg-primary/5 text-primary flex items-center gap-1"
                : "shrink-0 h-8 px-3 rounded-full text-xs font-medium border border-border text-foreground bg-surface flex items-center gap-1"
            }
          >
            <StickyNote size={12} />
            メモあり
          </button>
        </div>

        {mounted && tab === "searches" && (
          <SearchHistoryList
            pinnedOnly={pinnedOnly}
            memoOnly={memoOnly}
            query={query}
          />
        )}
        {mounted && tab === "views" && (
          <ViewHistoryList
            pinnedOnly={pinnedOnly}
            memoOnly={memoOnly}
            query={query}
          />
        )}
        {mounted && tab === "lists" && <SavedListsHistory query={query} />}
        {mounted && tab === "advices" && <AdviceHistoryList query={query} />}
      </div>
    </AppShell>
  );
}

function SearchHistoryList({
  pinnedOnly,
  memoOnly,
  query,
}: {
  pinnedOnly: boolean;
  memoOnly: boolean;
  query: string;
}) {
  const queryClient = useQueryClient();
  const historyQuery = useQuery({
    queryKey: ["search_history"],
    queryFn: () => fetchSearchHistory(200),
    staleTime: 30_000,
  });

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = historyQuery.data ?? [];
    return all.filter((h) => !q || h.keyword.toLowerCase().includes(q));
  }, [historyQuery.data, query]);

  // 保存検索 (is_favorite=true) は最上部の固定セクションに分離
  const favorites = items.filter((i) => i.isFavorite);
  const regulars = items.filter((i) => !i.isFavorite);
  const groups = useMemo(
    () => groupByDate(regulars, (i) => i.lastUsedAt),
    [regulars]
  );

  async function handleToggleFavorite(keyword: string, current: boolean) {
    await toggleFavoriteKeyword(keyword, !current);
    await queryClient.invalidateQueries({ queryKey: ["search_history"] });
  }

  async function handleDelete(keyword: string) {
    await deleteSearchHistoryEntry(keyword);
    await queryClient.invalidateQueries({ queryKey: ["search_history"] });
  }

  if (historyQuery.isLoading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center text-sm text-muted">
        読込中...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <SearchIcon className="text-muted mx-auto mb-2" size={28} />
        <p className="text-sm text-muted">
          {query ? "該当する検索履歴がありません" : "検索履歴がまだありません"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {favorites.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold text-muted px-1 inline-flex items-center gap-1">
            <Star size={10} className="text-warning" fill="currentColor" />
            保存検索
          </div>
          {favorites.map((h) => (
            <SearchHistoryCard
              key={`fav-${h.keyword}`}
              keyword={h.keyword}
              count={h.count}
              lastUsedAt={h.lastUsedAt}
              isFavorite={h.isFavorite}
              pinnedOnly={pinnedOnly}
              memoOnly={memoOnly}
              onToggleFavorite={() =>
                handleToggleFavorite(h.keyword, h.isFavorite)
              }
              onDelete={() => handleDelete(h.keyword)}
            />
          ))}
        </div>
      )}
      {DATE_GROUP_ORDER.map((g) => {
        const list = groups[g];
        if (list.length === 0) return null;
        return (
          <div key={g} className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold text-muted px-1">
              {g}
            </div>
            {list.map((h) => (
              <SearchHistoryCard
                key={`his-${h.keyword}`}
                keyword={h.keyword}
                count={h.count}
                lastUsedAt={h.lastUsedAt}
                isFavorite={h.isFavorite}
                pinnedOnly={pinnedOnly}
                memoOnly={memoOnly}
                onToggleFavorite={() =>
                  handleToggleFavorite(h.keyword, h.isFavorite)
                }
                onDelete={() => handleDelete(h.keyword)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SearchHistoryCard({
  keyword,
  count,
  lastUsedAt,
  isFavorite,
  pinnedOnly,
  memoOnly,
  onToggleFavorite,
  onDelete,
}: {
  keyword: string;
  count: number;
  lastUsedAt: string;
  isFavorite: boolean;
  pinnedOnly: boolean;
  memoOnly: boolean;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  const searchKey = searchKeyFromKeyword(keyword);
  const memo = useMemoValue(searchKey);
  const pinned = usePinnedValue(searchKey);

  if (pinnedOnly && !pinned) return null;
  if (memoOnly && !memo) return null;

  const href = `/search/loading?keyword=${encodeURIComponent(
    keyword,
  )}&period=90&sources=yahoo_auction,mercari,jimoty`;

  return (
    <div className="bg-surface border border-border rounded-xl p-3 flex items-stretch gap-2 hover:border-primary/40 transition-colors">
      <Link href={href} className="flex-1 min-w-0 flex items-start gap-2 py-1">
        <SearchIcon size={16} className="text-muted shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {pinned && (
              <Star
                size={12}
                className="text-warning shrink-0"
                fill="currentColor"
              />
            )}
            <p className="text-sm font-semibold text-foreground line-clamp-1">
              {keyword}
            </p>
          </div>
          {memo && (
            <div className="flex items-start gap-1.5 mt-1.5 mb-1 p-2 rounded-md bg-warning/10 border border-warning/20">
              <StickyNote
                size={12}
                className="text-warning mt-0.5 shrink-0"
              />
              <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
                {memo}
              </p>
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span>{count} 回検索</span>
            <span>・</span>
            <RelativeDate iso={lastUsedAt} />
          </div>
        </div>
      </Link>
      <div className="flex flex-col items-center justify-between gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggleFavorite}
          className="p-1.5 rounded-md hover:bg-surface-2 active:bg-surface-2"
          aria-label={isFavorite ? "保存検索を解除" : "保存検索に追加"}
        >
          <Star
            size={16}
            className={isFavorite ? "text-warning" : "text-muted"}
            fill={isFavorite ? "currentColor" : "none"}
          />
        </button>
        <Link
          href={href}
          className="p-1.5 rounded-md hover:bg-surface-2 active:bg-surface-2"
          aria-label="再検索"
        >
          <SearchIcon size={14} className="text-primary" />
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md hover:bg-surface-2 active:bg-surface-2"
          aria-label="履歴から削除"
        >
          <Trash2 size={14} className="text-muted" />
        </button>
      </div>
    </div>
  );
}

function ViewHistoryList({
  pinnedOnly,
  memoOnly,
  query,
}: {
  pinnedOnly: boolean;
  memoOnly: boolean;
  query: string;
}) {
  const allViews = useListingViews();

  const views = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allViews;
    return allViews.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.fromKeyword?.toLowerCase().includes(q) ?? false)
    );
  }, [allViews, query]);

  const groups = useMemo(
    () => groupByDate(views, (v) => v.viewedAt),
    [views]
  );

  if (allViews.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <Eye className="text-muted mx-auto mb-2" size={28} />
        <p className="text-sm text-muted">まだ閲覧した商品がありません</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          検索結果から商品の詳細を開くと、ここに記録されます
        </p>
      </div>
    );
  }

  if (views.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <SearchIcon className="text-muted mx-auto mb-2" size={28} />
        <p className="text-sm text-muted">該当する閲覧履歴がありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {DATE_GROUP_ORDER.map((g) => {
        const list = groups[g];
        if (list.length === 0) return null;
        return (
          <div key={g} className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold text-muted px-1">
              {g}
            </div>
            {list.map((v) => (
              <ViewHistoryCard
                key={v.ref + v.viewedAt}
                view={v}
                pinnedOnly={pinnedOnly}
                memoOnly={memoOnly}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ViewHistoryCard({
  view,
  pinnedOnly,
  memoOnly,
}: {
  view: ListingViewSnapshot;
  pinnedOnly: boolean;
  memoOnly: boolean;
}) {
  const pinned = useListingPinnedValue(view.ref);
  const memo = useListingMemoValue(view.ref);

  if (pinnedOnly && !pinned) return null;
  if (memoOnly && !memo) return null;

  const detailHref = `/search/result/recent/listing/${view.ref}${
    view.fromKeyword
      ? `?keyword=${encodeURIComponent(view.fromKeyword)}`
      : ""
  }`;

  const rank = classifyCondition(view.condition);

  return (
    <Link
      href={detailHref}
      className="bg-surface border border-border rounded-xl overflow-hidden hover:border-primary/40 active:bg-surface-2 transition-colors"
    >
      <div className="flex p-3 gap-3">
        {view.thumbnail ? (
          <Image
            src={view.thumbnail}
            alt=""
            width={80}
            height={80}
            loading="lazy"
            unoptimized
            className="w-20 h-20 rounded-lg object-cover bg-surface-2 shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-surface-2 shrink-0 flex items-center justify-center text-muted text-[10px]">
            画像なし
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <SourceBadge source={view.source} />
              <ConditionBadge rank={rank} size="sm" />
            </div>
            {pinned && (
              <Star
                size={14}
                className="text-warning shrink-0"
                fill="currentColor"
              />
            )}
          </div>
          <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
            {view.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-base font-bold text-foreground">
              {formatYen(view.price)}
            </span>
          </div>
          <div className="text-xs text-muted mt-1">
            閲覧: <RelativeDate iso={view.viewedAt} />
            {view.fromKeyword && (
              <span className="ml-2">・ 検索: {view.fromKeyword}</span>
            )}
          </div>
        </div>
      </div>
      {memo && (
        <div className="flex items-start gap-1.5 px-3 pb-3 pt-0">
          <div className="flex-1 flex items-start gap-1.5 p-2 rounded-md bg-warning/10 border border-warning/20">
            <StickyNote
              size={12}
              className="text-warning mt-0.5 shrink-0"
            />
            <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
              {memo}
            </p>
          </div>
        </div>
      )}
    </Link>
  );
}

function AdviceHistoryList({ query }: { query: string }) {
  const all = useSavedAdvices();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (a) =>
        a.keyword.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q)
    );
  }, [all, query]);

  const groups = useMemo(
    () => groupByDate(filtered, (a) => a.savedAt),
    [filtered]
  );

  if (all.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <Sparkles className="text-muted mx-auto mb-2" size={28} />
        <p className="text-sm text-muted">保存されたAI査定がありません</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          結果画面の「査定ツール」→ AI査定で「保存」を押すと、ここに記録されます
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <SearchIcon className="text-muted mx-auto mb-2" size={28} />
        <p className="text-sm text-muted">該当するAI査定がありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {DATE_GROUP_ORDER.map((g) => {
        const list = groups[g];
        if (list.length === 0) return null;
        return (
          <div key={g} className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold text-muted px-1">{g}</div>
            {list.map((a) => (
              <AdviceCard key={a.searchKey + a.savedAt} advice={a} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AdviceCard({ advice }: { advice: SavedAdvice }) {
  const href = `/search/result/recent?keyword=${encodeURIComponent(advice.keyword)}&period=30&sources=yahoo_auction,mercari,jimoty`;

  return (
    <div className="bg-gradient-to-br from-primary/5 to-accent/5 border border-primary/20 rounded-xl p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link href={href} className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={12} className="text-primary shrink-0" />
            <p className="text-xs font-semibold text-primary truncate">
              {advice.keyword}
            </p>
          </div>
          {advice.productGuess && (
            <p className="text-sm font-bold text-foreground line-clamp-1">
              {advice.productGuess}
            </p>
          )}
        </Link>
        <button
          type="button"
          onClick={() => removeSavedAdvice(advice.searchKey)}
          aria-label="削除"
          className="shrink-0 w-7 h-7 rounded-md text-muted hover:bg-surface-2 hover:text-danger flex items-center justify-center"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <p className="text-xs text-foreground line-clamp-3 leading-relaxed mb-2.5">
        {advice.summary}
      </p>

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        {advice.recommendations.slice(0, 4).map((r) => (
          <div
            key={r.rank}
            className="bg-surface border border-border rounded p-1.5"
          >
            <div className="text-[10px] text-muted">{r.rank}</div>
            <div className="text-xs font-bold text-foreground">
              ¥{r.price.toLocaleString("ja-JP")}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>保存: <RelativeDate iso={advice.savedAt} /></span>
        <Link
          href={href}
          className="text-primary hover:underline"
        >
          検索を開く →
        </Link>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "tap-scale h-9 rounded-md text-xs font-semibold bg-surface text-foreground shadow-sm flex items-center justify-center gap-1"
          : "tap-scale h-9 rounded-md text-xs font-medium text-muted hover:text-foreground flex items-center justify-center gap-1"
      }
    >
      {icon}
      {label}
    </button>
  );
}

function SavedListsHistory({ query }: { query: string }) {
  const lists = useAllLists();
  const router = useRouter();
  const current = useCurrentList();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter(
      (l) =>
        l.items.some((i) => i.query.keyword.toLowerCase().includes(q)) ||
        (l.name?.toLowerCase().includes(q) ?? false)
    );
  }, [lists, query]);

  function handleResume(id: string) {
    switchToList(id);
    toast({
      message: "リストに切替えました",
      actionLabel: "リストへ",
      actionHref: "/list",
    });
    router.push("/list");
  }

  if (lists.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <ListChecks className="text-muted mx-auto mb-2" size={28} />
        <p className="text-sm text-muted">査定リストがありません</p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          検索画面から「査定リストに追加」すると、ここに記録されます
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <SearchIcon className="text-muted mx-auto mb-2" size={28} />
        <p className="text-sm text-muted">該当する査定リストがありません</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {filtered.map((l) => {
        const completed = l.items.filter((i) => i.status === "completed");
        const total = completed.reduce(
          (s, i) => s + (i.result?.suggestedBuyPrice ?? 0),
          0
        );
        const isCurrent = l.id === current.id;
        return (
          <div
            key={l.id}
            className={
              isCurrent
                ? "bg-primary/5 border-2 border-primary rounded-xl p-4"
                : "bg-surface border border-border rounded-xl p-4"
            }
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <ListChecks size={14} className="text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground truncate">
                  {l.name ?? "（無題）"}
                </span>
                {isCurrent && (
                  <span className="shrink-0 text-[10px] font-bold text-primary px-1.5 py-0.5 rounded-full bg-primary/10">
                    使用中
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted shrink-0">
                <RelativeDate iso={l.updatedAt} />
              </span>
            </div>
            {l.items.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {l.items.slice(0, 5).map((i) => (
                  <span
                    key={i.id}
                    className="text-[11px] text-foreground bg-surface-2 px-2 py-0.5 rounded-full"
                  >
                    {i.query.keyword}
                  </span>
                ))}
                {l.items.length > 5 && (
                  <span className="text-[11px] text-muted px-1 self-center">
                    他{l.items.length - 5}件
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center justify-between text-xs mb-3">
              <span className="text-muted">
                完了 {completed.length} / {l.items.length}件
              </span>
              {completed.length > 0 && (
                <span className="font-bold text-foreground">
                  合計目安 {formatYen(total)}
                </span>
              )}
            </div>
            {!isCurrent && (
              <button
                type="button"
                onClick={() => handleResume(l.id)}
                className="tap-scale w-full h-10 rounded-lg border-2 border-primary text-primary text-xs font-semibold hover:bg-primary/5"
              >
                このリストで査定を再開
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
