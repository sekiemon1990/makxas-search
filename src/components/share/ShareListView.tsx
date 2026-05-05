import { formatYen } from "@/lib/utils";
import { ShareListEditor } from "./ShareListEditor";

export type SharedItem = {
  id: string;
  keyword: string;
  sources: string[];
  status: string;
  median: number | null;
  min_price: number | null;
  max_price: number | null;
  suggested_buy_price: number | null;
  appraisal_status: string | null;
  added_at: string;
};

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

const APPRAISAL_STYLE: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  pending: { label: "未査定", bg: "bg-muted/10", text: "text-muted" },
  accepted: { label: "買取OK", bg: "bg-success/10", text: "text-success" },
  rejected: { label: "買取NG", bg: "bg-danger/10", text: "text-danger" },
};

interface Props {
  list: SharedList;
  items: SharedItem[];
  token: string;
  permission: "view" | "edit";
}

export function ShareListView({ list, items, token, permission }: Props) {
  const completed = items.filter((i) => i.status === "completed");
  const total = completed.reduce(
    (s, i) => s + (i.suggested_buy_price ?? 0),
    0
  );

  const accepted = completed.filter((i) => i.appraisal_status === "accepted");
  const acceptedTotal = accepted.reduce(
    (s, i) => s + (i.suggested_buy_price ?? 0),
    0
  );

  if (permission === "edit") {
    // 編集モードは Client Component に委譲
    return (
      <ShareListEditor
        list={list}
        initialItems={items}
        token={token}
        total={total}
        acceptedTotal={acceptedTotal}
      />
    );
  }

  // 閲覧モード (Server Component のまま静的描画)
  return (
    <div className="max-w-[960px] mx-auto p-6 flex flex-col gap-5">
      {/* ヘッダー */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          {list.name ?? "査定リスト"}
        </h1>
        <p className="text-xs text-muted mt-1">{items.length}件</p>
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
          const appraisal = APPRAISAL_STYLE[item.appraisal_status ?? "pending"] ?? APPRAISAL_STYLE.pending;
          return (
            <div
              key={item.id}
              className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center gap-3"
            >
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

              {/* 査定ステータスバッジ */}
              <span
                className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${appraisal.bg} ${appraisal.text}`}
              >
                {appraisal.label}
              </span>
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
