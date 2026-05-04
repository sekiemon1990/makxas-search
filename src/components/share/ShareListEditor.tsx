"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X, Loader2, RefreshCw } from "lucide-react";
import { formatYen } from "@/lib/utils";
import type { SharedItem } from "./ShareListView";

type SharedList = {
  id: string;
  name: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  yahoo_auction: "ヤフオク",
  mercari: "メルカリ",
  jimoty: "ジモティー",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "完了",
  running: "実行中",
  queued: "待機中",
  error: "エラー",
  cancelled: "中止",
};

type AppraisalStatus = "pending" | "accepted" | "rejected";

const APPRAISAL_OPTS: {
  value: AppraisalStatus;
  label: string;
  bg: string;
  text: string;
}[] = [
  { value: "pending", label: "未査定", bg: "bg-muted/10", text: "text-muted" },
  { value: "accepted", label: "買取OK", bg: "bg-success/10", text: "text-success" },
  { value: "rejected", label: "買取NG", bg: "bg-danger/10", text: "text-danger" },
];

interface Props {
  list: SharedList;
  initialItems: SharedItem[];
  token: string;
  total: number;
  acceptedTotal: number;
}

export function ShareListEditor({
  list,
  initialItems,
  token,
  total: initialTotal,
  acceptedTotal: initialAcceptedTotal,
}: Props) {
  const [items, setItems] = useState<SharedItem[]>(initialItems);
  const [updating, setUpdating] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 5秒ごとにポーリングして他ユーザーの変更を反映
  const poll = useCallback(async () => {
    try {
      setSyncing(true);
      const res = await fetch(`/api/share/${token}/list/items`);
      if (res.ok) {
        const data = (await res.json()) as { items: SharedItem[] };
        setItems(data.items);
      }
    } catch {
      // ネットワークエラーは無視
    } finally {
      setSyncing(false);
    }
  }, [token]);

  useEffect(() => {
    intervalRef.current = setInterval(poll, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  async function updateStatus(itemId: string, status: AppraisalStatus) {
    setUpdating(itemId);
    // 楽観的更新
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, appraisal_status: status } : i
      )
    );
    try {
      const res = await fetch(
        `/api/share/${token}/list/items/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appraisal_status: status }),
        }
      );
      if (!res.ok) throw new Error("更新失敗");
    } catch {
      // 失敗したらロールバック
      await poll();
    } finally {
      setUpdating(null);
    }
  }

  const completed = items.filter((i) => i.status === "completed");
  const total = completed.reduce((s, i) => s + (i.suggested_buy_price ?? 0), 0);
  const acceptedTotal = completed
    .filter((i) => i.appraisal_status === "accepted")
    .reduce((s, i) => s + (i.suggested_buy_price ?? 0), 0);

  // suppress unused props warning
  void initialTotal;
  void initialAcceptedTotal;

  return (
    <div className="max-w-[960px] mx-auto p-6 flex flex-col gap-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {list.name ?? "査定リスト"}
          </h1>
          <p className="text-xs text-muted mt-1">{items.length}件</p>
        </div>
        <div className="flex items-center gap-2">
          {syncing && <RefreshCw size={13} className="text-muted animate-spin" />}
          <span className="text-xs text-muted bg-success/10 text-success px-2 py-1 rounded-full font-semibold">
            編集モード
          </span>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface border border-border rounded-xl px-5 py-4">
          <div className="text-xs text-muted mb-1">合計査定額（目安）</div>
          <div className="text-2xl font-bold text-foreground">
            {formatYen(total)}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl px-5 py-4">
          <div className="text-xs text-muted mb-1">買取OK 合計</div>
          <div className="text-2xl font-bold text-success">
            {formatYen(acceptedTotal)}
          </div>
        </div>
      </div>

      {/* アイテム一覧 */}
      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const currentStatus = (item.appraisal_status ?? "pending") as AppraisalStatus;
          const isUpdating = updating === item.id;

          return (
            <div
              key={item.id}
              className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center gap-3"
            >
              {/* アイテム情報 */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">
                  {item.keyword}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.sources.map((src) => (
                    <span
                      key={src}
                      className="text-[10px] text-info font-semibold"
                    >
                      {SOURCE_LABEL[src] ?? src}
                    </span>
                  ))}
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      item.status === "completed"
                        ? "bg-success/10 text-success"
                        : "bg-muted/10 text-muted"
                    }`}
                  >
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>
              </div>

              {/* 査定結果 */}
              {item.median !== null && (
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted">中央値</div>
                  <div className="text-sm font-bold text-foreground">
                    {formatYen(item.median)}
                  </div>
                  {item.suggested_buy_price !== null && (
                    <div className="text-xs text-primary font-semibold">
                      買取 {formatYen(item.suggested_buy_price)}
                    </div>
                  )}
                </div>
              )}

              {/* 査定ステータス切り替えボタン */}
              <div className="flex items-center gap-1 shrink-0">
                {isUpdating ? (
                  <Loader2 size={16} className="animate-spin text-muted" />
                ) : (
                  APPRAISAL_OPTS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateStatus(item.id, opt.value)}
                      disabled={currentStatus === opt.value}
                      title={opt.label}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${
                        currentStatus === opt.value
                          ? `${opt.bg} ${opt.text} ring-2 ring-current ring-offset-1 ring-offset-surface`
                          : "bg-muted/5 text-muted hover:bg-muted/15"
                      }`}
                    >
                      {opt.value === "accepted" ? (
                        <span className="flex items-center gap-0.5">
                          <Check size={10} />
                          OK
                        </span>
                      ) : opt.value === "rejected" ? (
                        <span className="flex items-center gap-0.5">
                          <X size={10} />
                          NG
                        </span>
                      ) : (
                        "未"
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="text-center text-muted text-sm py-12">
            アイテムがありません
          </div>
        )}
      </div>
    </div>
  );
}
