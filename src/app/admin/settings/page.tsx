"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  MessageSquarePlus,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Bug,
  Sparkles,
  Lightbulb,
  MessageSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

type FeedbackStatus = "open" | "done";
type FeedbackFilter = "open" | "done" | "all";

type FeedbackRow = {
  id: string;
  type: "bug" | "feature" | "improvement" | "other";
  author: string | null;
  title: string;
  body: string;
  page_href: string | null;
  status: FeedbackStatus;
  created_at: string;
};

const TYPE_META: Record<
  FeedbackRow["type"],
  { label: string; icon: React.ReactNode; color: string }
> = {
  bug: {
    label: "バグ報告",
    icon: <Bug size={11} />,
    color: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  },
  feature: {
    label: "機能追加",
    icon: <Sparkles size={11} />,
    color: "bg-primary/10 text-primary",
  },
  improvement: {
    label: "改善提案",
    icon: <Lightbulb size={11} />,
    color:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  },
  other: {
    label: "その他",
    icon: <MessageSquare size={11} />,
    color: "bg-surface-2 text-muted",
  },
};

// ─────────────────────────────────────────────
// AIコンテキスト設定セクション
// ─────────────────────────────────────────────

function AiContextSection() {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("app_config")
        .select("value, updated_at")
        .eq("key", "ai_context")
        .maybeSingle();
      if (data) {
        setValue(data.value ?? "");
        setSavedAt(data.updated_at);
      }
      setLoading(false);
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    await supabase.from("app_config").upsert(
      { key: "ai_context", value, updated_at: now },
      { onConflict: "key" },
    );
    setSavedAt(now);
    setSaving(false);
  }

  const savedTime = savedAt
    ? new Date(savedAt).toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Bot size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          AIコンテキスト設定
        </h2>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        AIアシスタントに常に伝えておきたい業務情報・注意事項を記入します。
        すべての管理画面チャットで参照されます。
      </p>

      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-muted" />
        </div>
      ) : (
        <>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={6}
            placeholder="例: 主な査定品目はブランドバッグ・時計・貴金属です。価格は税込みで表示しています。"
            className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none leading-relaxed"
          />
          <div className="flex items-center justify-between">
            {savedTime ? (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 size={12} />
                {savedTime}に保存しました
              </span>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              保存する
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// フィードバック一覧セクション
// ─────────────────────────────────────────────

function FeedbackSection() {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedbackFilter>("open");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function fetchFeedback() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("feedback_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data as FeedbackRow[]) ?? []);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchFeedback(); }, []); // async内のsetStateのため警告抑制

  async function updateStatus(id: string, status: FeedbackStatus) {
    setUpdatingId(id);
    const supabase = createClient();
    await supabase.from("feedback_logs").update({ status }).eq("id", id);
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    setUpdatingId(null);
  }

  const filtered = items.filter((item) => {
    if (filter === "all") return true;
    return item.status === filter;
  });

  const openCount = items.filter((i) => i.status === "open").length;
  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquarePlus size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            フィードバック一覧
          </h2>
        </div>
        <button
          type="button"
          onClick={fetchFeedback}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-2 text-xs transition-colors"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          更新
        </button>
      </div>

      {/* フィルター */}
      <div className="flex gap-2">
        {(
          [
            { key: "open", label: `未対応 (${openCount}件)` },
            { key: "done", label: `対応済み (${doneCount}件)` },
            { key: "all", label: "すべて" },
          ] as { key: FeedbackFilter; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filter === key
                ? "bg-primary/10 text-primary border-primary/30"
                : "border-border text-muted hover:bg-surface-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* リスト */}
      {loading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 size={18} className="animate-spin text-muted" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted py-8">
          {filter === "open" ? "未対応のフィードバックはありません" : "データがありません"}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => {
            const meta = TYPE_META[item.type];
            const date = new Date(item.created_at).toLocaleDateString("ja-JP", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div
                key={item.id}
                className={`border rounded-xl p-4 flex flex-col gap-2 transition-opacity ${
                  item.status === "done"
                    ? "border-border bg-surface-2 opacity-60"
                    : "border-border bg-surface"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${meta.color}`}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {item.title}
                    </span>
                  </div>
                  {item.status === "open" ? (
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, "done")}
                      disabled={updatingId === item.id}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-950/60 disabled:opacity-50"
                    >
                      {updatingId === item.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={11} />
                      )}
                      対応済み
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, "open")}
                      disabled={updatingId === item.id}
                      className="shrink-0 px-2.5 py-1 rounded-lg border border-border text-muted text-xs hover:bg-surface-2 disabled:opacity-50"
                    >
                      戻す
                    </button>
                  )}
                </div>
                <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">
                  {item.body}
                </p>
                <div className="flex items-center gap-3 text-[11px] text-muted">
                  <span>{date}</span>
                  {item.author && <span>by {item.author}</span>}
                  {item.page_href && (
                    <span className="truncate max-w-[200px]">{item.page_href}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ページ本体
// ─────────────────────────────────────────────

export default function AdminSettingsPage() {
  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-foreground">管理設定</h1>
        <p className="text-xs text-muted mt-1">AIコンテキストとフィードバックの管理</p>
      </div>

      <AiContextSection />
      <FeedbackSection />
    </div>
  );
}
