"use client";

import { useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import type { SourceResult } from "@/lib/types";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────

type SessionStep = "start" | "capturing" | "reviewing" | "analyzing" | "results";

type SessionItem = {
  id: string;
  photos: File[];
  thumbnails: string[]; // ObjectURL for preview
  // analyzing完了後に設定:
  productName?: string;
  model?: string;
  keywords?: string;
  confidence?: "high" | "medium" | "low";
  // 相場検索完了後:
  median?: number;
  min?: number;
  max?: number;
  count?: number;
  searchDone?: boolean;
};

// ──────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────

function fileToResizedBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width >= height) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          } else {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const resized = canvas.toDataURL("image/jpeg", 0.8);
        // "data:image/jpeg;base64,XXXX" → "XXXX"
        resolve(resized.split(",")[1]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function calcMedian(prices: number[]): number {
  if (prices.length === 0) return 0;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function makeSearchUrl(keywords: string): string {
  return `https://makxas-search.vercel.app/search/loading?keyword=${encodeURIComponent(keywords)}&period=90&sources=yahoo_auction,mercari,jimoty`;
}

// ──────────────────────────────────────────────
// メインコンポーネント
// ──────────────────────────────────────────────

export default function SessionPage() {
  const [step, setStep] = useState<SessionStep>("start");
  const [items, setItems] = useState<SessionItem[]>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [analyzeProgress, setAnalyzeProgress] = useState<string>("商品特定中...");
  const [editingKeywords, setEditingKeywords] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 新しいアイテムを作る ──
  function createNewItem(): SessionItem {
    return {
      id: crypto.randomUUID(),
      photos: [],
      thumbnails: [],
    };
  }

  // ── 写真追加 ──
  function handlePhotoSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    const newThumbs = newFiles.map((f) => URL.createObjectURL(f));

    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[currentItemIndex] };
      item.photos = [...item.photos, ...newFiles];
      item.thumbnails = [...item.thumbnails, ...newThumbs];
      next[currentItemIndex] = item;
      return next;
    });
  }

  // ── サムネイル削除 ──
  function handleRemovePhoto(photoIdx: number) {
    if (!confirm("この写真を削除しますか?")) return;
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[currentItemIndex] };
      URL.revokeObjectURL(item.thumbnails[photoIdx]);
      item.photos = item.photos.filter((_, i) => i !== photoIdx);
      item.thumbnails = item.thumbnails.filter((_, i) => i !== photoIdx);
      next[currentItemIndex] = item;
      return next;
    });
  }

  // ── 次の商品へ ──
  function handleNextItem() {
    const newItem = createNewItem();
    setItems((prev) => [...prev, newItem]);
    setCurrentItemIndex(items.length); // index of newly added item
  }

  // ── 撮影完了・確認へ ──
  function handleGoReview() {
    setStep("reviewing");
  }

  // ── 追加撮影 ──
  function handleRetakeItem(idx: number) {
    setCurrentItemIndex(idx);
    setStep("capturing");
  }

  // ── 新しい商品を追加してcapturingへ ──
  function handleAddNewItemFromReview() {
    const newItem = createNewItem();
    setItems((prev) => [...prev, newItem]);
    setCurrentItemIndex(items.length);
    setStep("capturing");
  }

  // ── 一括解析 ──
  async function handleAnalyze() {
    setStep("analyzing");
    setAnalyzeProgress("商品特定中...");

    try {
      // 1. 各アイテムの写真をbase64変換
      const itemInputs = await Promise.all(
        items.map(async (item) => {
          const photos = await Promise.all(item.photos.map(fileToResizedBase64));
          return { id: item.id, photos };
        }),
      );

      // 2. vision/identify APIに送信
      const identifyRes = await fetch("/api/vision/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemInputs }),
      });

      if (!identifyRes.ok) {
        const err = await identifyRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "商品特定APIエラー");
      }

      const { results } = (await identifyRes.json()) as {
        results: Array<{
          id: string;
          productName: string;
          model: string;
          keywords: string;
          confidence: "high" | "medium" | "low";
        }>;
      };

      // 3. 結果をitemsに反映
      setItems((prev) =>
        prev.map((item) => {
          const found = results.find((r) => r.id === item.id);
          if (!found) return item;
          return {
            ...item,
            productName: found.productName,
            model: found.model,
            keywords: found.keywords,
            confidence: found.confidence,
          };
        }),
      );

      // 4. 各アイテムのkeywordsで並列に相場検索
      setAnalyzeProgress("相場検索中...");

      const updatedItems = items.map((item) => {
        const found = results.find((r) => r.id === item.id);
        return found
          ? { ...item, productName: found.productName, model: found.model, keywords: found.keywords, confidence: found.confidence }
          : item;
      });

      const marketResults = await Promise.all(
        updatedItems.map(async (item) => {
          if (!item.keywords) return item;
          try {
            const [yahooRes, mercariRes, jimotyRes] = await Promise.allSettled([
              fetch("/api/scrape/yahoo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyword: item.keywords, limit: 30, status: "sold" }),
              }).then((r) => r.json()),
              fetch("/api/scrape/mercari", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyword: item.keywords, limit: 30, status: "sold" }),
              }).then((r) => r.json()),
              fetch("/api/scrape/jimoty", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyword: item.keywords, limit: 30 }),
              }).then((r) => r.json()),
            ]);

            const allPrices: number[] = [];
            let totalCount = 0;

            for (const res of [yahooRes, mercariRes, jimotyRes]) {
              if (res.status === "fulfilled") {
                const data = res.value as { result?: SourceResult };
                if (data.result && Array.isArray(data.result.listings)) {
                  const prices = data.result.listings
                    .map((l: { price: number }) => l.price)
                    .filter((p: number) => p > 0);
                  allPrices.push(...prices);
                  totalCount += prices.length;
                }
              }
            }

            if (allPrices.length === 0) {
              return { ...item, searchDone: true };
            }

            const sorted = [...allPrices].sort((a, b) => a - b);
            const median = calcMedian(allPrices);
            const min = sorted[0];
            const max = sorted[sorted.length - 1];

            return {
              ...item,
              median,
              min,
              max,
              count: totalCount,
              searchDone: true,
            };
          } catch {
            return { ...item, searchDone: true };
          }
        }),
      );

      setItems(marketResults);
      setStep("results");
    } catch (err) {
      console.error("[session/analyze]", err);
      alert(
        err instanceof Error ? err.message : "解析中にエラーが発生しました",
      );
      setStep("reviewing");
    }
  }

  // ── 再撮影 ──
  function handleReshoot(itemId: string) {
    const idx = items.findIndex((it) => it.id === itemId);
    if (idx === -1) return;
    // 写真をリセット
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, photos: [], thumbnails: [], productName: undefined, model: undefined, keywords: undefined, confidence: undefined, median: undefined, min: undefined, max: undefined, count: undefined, searchDone: false }
          : it,
      ),
    );
    setCurrentItemIndex(idx);
    setStep("capturing");
  }

  // ── キーワード編集 → 再検索 ──
  async function handleReSearch(itemId: string) {
    const kw = editingKeywords[itemId];
    if (!kw?.trim()) return;

    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, keywords: kw, searchDone: false, median: undefined, min: undefined, max: undefined, count: undefined }
          : it,
      ),
    );

    try {
      const [yahooRes, mercariRes, jimotyRes] = await Promise.allSettled([
        fetch("/api/scrape/yahoo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: kw.trim(), limit: 30, status: "sold" }),
        }).then((r) => r.json()),
        fetch("/api/scrape/mercari", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: kw.trim(), limit: 30, status: "sold" }),
        }).then((r) => r.json()),
        fetch("/api/scrape/jimoty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: kw.trim(), limit: 30 }),
        }).then((r) => r.json()),
      ]);

      const allPrices: number[] = [];
      let totalCount = 0;

      for (const res of [yahooRes, mercariRes, jimotyRes]) {
        if (res.status === "fulfilled") {
          const data = res.value as { result?: SourceResult };
          if (data.result && Array.isArray(data.result.listings)) {
            const prices = data.result.listings
              .map((l: { price: number }) => l.price)
              .filter((p: number) => p > 0);
            allPrices.push(...prices);
            totalCount += prices.length;
          }
        }
      }

      if (allPrices.length === 0) {
        setItems((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, searchDone: true } : it)),
        );
        return;
      }

      const sorted = [...allPrices].sort((a, b) => a - b);
      const median = calcMedian(allPrices);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];

      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? { ...it, median, min, max, count: totalCount, searchDone: true }
            : it,
        ),
      );
      // キーワード編集ボックスを消す
      setEditingKeywords((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      console.error("[session/reSearch]", err);
      alert("再検索中にエラーが発生しました");
    }
  }

  // ── 全リセット ──
  function handleReset() {
    // ObjectURLを解放
    for (const item of items) {
      for (const thumb of item.thumbnails) {
        URL.revokeObjectURL(thumb);
      }
    }
    setItems([]);
    setCurrentItemIndex(0);
    setStep("start");
    setEditingKeywords({});
  }

  // ──────────────────────────────────────────────
  // 各ステップのUI
  // ──────────────────────────────────────────────

  function renderStart() {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">写真で一括査定</h1>
          <p className="text-muted text-sm">スマホカメラで商品を撮影するだけで、AIが商品を特定して相場を自動検索します。</p>
        </div>
        <ul className="w-full max-w-sm space-y-3">
          {[
            { num: "1", text: "査定したい商品を1点ずつ撮影する" },
            { num: "2", text: "AIが商品名・型番を自動特定する" },
            { num: "3", text: "ヤフオク・メルカリ・ジモティーの相場を自動取得する" },
          ].map((s) => (
            <li key={s.num} className="flex items-start gap-3 bg-surface-2 rounded-lg px-4 py-3">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {s.num}
              </span>
              <span className="text-sm text-foreground">{s.text}</span>
            </li>
          ))}
        </ul>
        <button
          className="w-full max-w-sm h-12 rounded-xl bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-colors"
          onClick={() => {
            const firstItem = createNewItem();
            setItems([firstItem]);
            setCurrentItemIndex(0);
            setStep("capturing");
          }}
        >
          査定を開始する
        </button>
      </div>
    );
  }

  function renderCapturing() {
    const currentItem = items[currentItemIndex];
    if (!currentItem) return null;
    const hasPhotos = currentItem.photos.length > 0;
    const hasItems = items.length > 0;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            商品 {currentItemIndex + 1} を追加中
          </h2>
          <span className="text-xs text-muted bg-surface-2 px-2 py-1 rounded-full">
            登録済み商品: {items.filter((it) => it.photos.length > 0).length}点
          </span>
        </div>

        {/* 写真追加ボタン */}
        <button
          className="w-full h-32 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted hover:border-primary hover:text-primary transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="text-3xl">📷</span>
          <span className="text-sm font-medium">写真を追加する</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handlePhotoSelect(e.target.files)}
          onClick={(e) => {
            // Reset value so same file can be re-selected
            (e.target as HTMLInputElement).value = "";
          }}
        />

        {/* サムネイルグリッド */}
        {hasPhotos && (
          <div className="grid grid-cols-3 gap-2">
            {currentItem.thumbnails.map((thumb, idx) => (
              <button
                key={thumb}
                className="relative aspect-square rounded-lg overflow-hidden border border-border"
                onClick={() => handleRemovePhoto(idx)}
                aria-label="写真を削除"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb}
                  alt={`写真 ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">
                  ×
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-2">
          <button
            className="w-full h-11 rounded-xl border border-border text-foreground font-medium text-sm hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!hasPhotos}
            onClick={handleNextItem}
          >
            次の商品へ →
          </button>
          <button
            className="w-full h-11 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!hasItems || items.every((it) => it.photos.length === 0)}
            onClick={handleGoReview}
          >
            撮影完了・内容を確認する
          </button>
        </div>

        <p className="text-center text-xs text-muted">
          登録済み商品: {items.filter((it) => it.photos.length > 0).length}点
        </p>
      </div>
    );
  }

  function renderReviewing() {
    const validItems = items.filter((it) => it.photos.length > 0);

    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">撮影内容を確認</h2>

        {validItems.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">商品がありません</p>
        ) : (
          <ul className="space-y-3">
            {validItems.map((item, idx) => (
              <li
                key={item.id}
                className="flex items-center gap-3 bg-surface-2 rounded-xl px-4 py-3"
              >
                <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    写真 {item.photos.length}枚
                  </p>
                  {/* サムネイル先頭1枚 */}
                  {item.thumbnails[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnails[0]}
                      alt="サムネイル"
                      className="w-16 h-16 object-cover rounded-lg mt-1"
                    />
                  )}
                </div>
                <button
                  className="shrink-0 text-xs text-primary underline"
                  onClick={() => handleRetakeItem(items.indexOf(item))}
                >
                  追加撮影
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 mt-2">
          <button
            className="w-full h-11 rounded-xl border border-border text-foreground font-medium text-sm hover:bg-surface-2 transition-colors"
            onClick={handleAddNewItemFromReview}
          >
            商品を追加する
          </button>
          <button
            className="w-full h-11 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={validItems.length === 0}
            onClick={handleAnalyze}
          >
            {validItems.length}点を一括解析する
          </button>
        </div>
      </div>
    );
  }

  function renderAnalyzing() {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">AIが商品を解析しています</p>
          <p className="text-sm text-muted mt-1">{analyzeProgress}</p>
        </div>
      </div>
    );
  }

  function renderResults() {
    const validItems = items.filter((it) => it.photos.length > 0);
    const totalEstimate = validItems.reduce((sum, item) => {
      if (item.median && item.searchDone) {
        return sum + Math.round(item.median * 0.8);
      }
      return sum;
    }, 0);

    return (
      <div className="flex flex-col gap-4">
        {/* 完了バナー */}
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-center">
          <p className="text-green-700 dark:text-green-400 font-semibold">
            ✓ {validItems.length}点の解析が完了しました
          </p>
        </div>

        {/* アイテムカード */}
        <div className="space-y-4">
          {validItems.map((item, idx) => {
            const estimate = item.median ? Math.round(item.median * 0.8) : null;
            const isLow = item.confidence === "low";
            const isEditing = editingKeywords[item.id] !== undefined;

            return (
              <div
                key={item.id}
                className="bg-surface-2 rounded-xl overflow-hidden border border-border"
              >
                <div className="flex gap-3 p-4">
                  {/* サムネイル */}
                  {item.thumbnails[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnails[0]}
                      alt={item.productName ?? `商品 ${idx + 1}`}
                      className="w-20 h-20 object-cover rounded-lg shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-surface rounded-lg shrink-0 flex items-center justify-center text-muted text-2xl">
                      📦
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted mb-0.5">商品 {idx + 1}</p>
                    <p className="font-semibold text-foreground text-sm leading-tight">
                      {item.productName ?? "商品名不明"}
                    </p>
                    {item.model && (
                      <p className="text-xs text-muted mt-0.5">{item.model}</p>
                    )}

                    {/* confidence警告 */}
                    {isLow && (
                      <div className="mt-1.5 flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
                        <span>⚠</span>
                        <span>判定に自信なし</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 相場 */}
                <div className="border-t border-border px-4 py-3">
                  {item.searchDone ? (
                    item.median ? (
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs text-muted">中央値</p>
                          <p className="text-xl font-bold text-foreground">
                            ¥{item.median.toLocaleString("ja-JP")}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            ¥{item.min!.toLocaleString("ja-JP")} 〜 ¥{item.max!.toLocaleString("ja-JP")}
                            {item.count ? ` (${item.count}件)` : ""}
                          </p>
                        </div>
                        {estimate !== null && (
                          <div className="text-right">
                            <p className="text-xs text-muted">見込金額</p>
                            <p className="text-lg font-bold text-primary">
                              ¥{estimate.toLocaleString("ja-JP")}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">相場データが取得できませんでした</p>
                    )
                  ) : (
                    <p className="text-sm text-muted">検索中...</p>
                  )}
                </div>

                {/* キーワード編集 (confidence=low のみ) */}
                {isLow && (
                  <div className="border-t border-border px-4 py-3">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingKeywords[item.id]}
                          onChange={(e) =>
                            setEditingKeywords((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-foreground text-sm"
                          placeholder="検索キーワードを入力"
                        />
                        <button
                          className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium"
                          onClick={() => handleReSearch(item.id)}
                        >
                          再検索
                        </button>
                      </div>
                    ) : (
                      <button
                        className="text-xs text-primary underline"
                        onClick={() =>
                          setEditingKeywords((prev) => ({
                            ...prev,
                            [item.id]: item.keywords ?? "",
                          }))
                        }
                      >
                        キーワードを編集
                      </button>
                    )}
                  </div>
                )}

                {/* アクションボタン */}
                <div className="border-t border-border px-4 py-3 flex gap-2">
                  <a
                    href={item.keywords ? makeSearchUrl(item.keywords) : "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 h-9 rounded-lg bg-primary/10 text-primary text-sm font-medium flex items-center justify-center hover:bg-primary/20 transition-colors"
                  >
                    相場を詳しく見る
                  </a>
                  <button
                    className="h-9 px-4 rounded-lg border border-border text-sm text-foreground hover:bg-surface transition-colors"
                    onClick={() => handleReshoot(item.id)}
                  >
                    再撮影
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 合計見込金額 */}
        {totalEstimate > 0 && (
          <div className="bg-surface-2 rounded-xl px-4 py-4 border border-border">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                {validItems.filter((it) => it.median).length}点の合計見込金額
              </p>
              <p className="text-2xl font-bold text-primary">
                ¥{totalEstimate.toLocaleString("ja-JP")}
              </p>
            </div>
          </div>
        )}

        <button
          className="w-full h-11 rounded-xl border border-border text-foreground font-medium text-sm hover:bg-surface-2 transition-colors mt-2"
          onClick={handleReset}
        >
          もう一度査定する
        </button>
      </div>
    );
  }

  return (
    <AppShell title="撮影査定">
      {step === "start" && renderStart()}
      {step === "capturing" && renderCapturing()}
      {step === "reviewing" && renderReviewing()}
      {step === "analyzing" && renderAnalyzing()}
      {step === "results" && renderResults()}
    </AppShell>
  );
}
