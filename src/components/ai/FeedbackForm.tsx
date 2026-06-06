"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type FeedbackType = "bug" | "feature" | "improvement" | "other";

const FEEDBACK_TYPES: {
  key: FeedbackType;
  label: string;
  emoji: string;
  color: string;
}[] = [
  { key: "bug", label: "バグ報告", emoji: "🐛", color: "text-red-500 border-red-300 bg-red-50 dark:bg-red-950/30" },
  { key: "feature", label: "機能追加依頼", emoji: "✨", color: "text-primary border-primary/40 bg-primary/5" },
  { key: "improvement", label: "改善提案", emoji: "💡", color: "text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30" },
  { key: "other", label: "その他", emoji: "💬", color: "text-muted border-border bg-surface-2" },
];

const AUTHOR_KEY = "feedback_author_name";

type Props = {
  compact?: boolean;
  onSent?: () => void;
};

export function FeedbackForm({ compact = false, onSent }: Props) {
  const pathname = usePathname();
  const [author, setAuthor] = useState(() => {
    try {
      return typeof window !== "undefined"
        ? (localStorage.getItem(AUTHOR_KEY) ?? "")
        : "";
    } catch {
      return "";
    }
  });
  const [type, setType] = useState<FeedbackType>("improvement");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError("");

    try {
      // お名前を保存
      try {
        if (author.trim()) localStorage.setItem(AUTHOR_KEY, author.trim());
      } catch {
        // noop
      }

      const supabase = createClient();
      const { error: insertError } = await supabase
        .from("feedback_logs")
        .insert({
          type,
          author: author.trim() || null,
          title: title.trim(),
          body: body.trim(),
          page_href: pathname,
          status: "open",
        });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setSent(true);
      setTitle("");
      setBody("");
      onSent?.();

      setTimeout(() => setSent(false), 4000);
    } catch {
      setError("送信に失敗しました。再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 text-center ${compact ? "py-6" : "py-12"}`}
      >
        <CheckCircle2 size={compact ? 28 : 40} className="text-green-500" />
        <p className={`font-semibold text-foreground ${compact ? "text-sm" : "text-base"}`}>
          送信しました！
        </p>
        <p className="text-xs text-muted">フィードバックありがとうございます。</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* お名前 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">
          お名前 <span className="text-[10px]">（任意）</span>
        </label>
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="例: 田中"
          className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* 種別 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">種別</label>
        <div className="grid grid-cols-2 gap-2">
          {FEEDBACK_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                type === t.key
                  ? t.color + " border-current ring-2 ring-current/20"
                  : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              <span>{t.emoji}</span>
              <span className={compact ? "text-xs" : "text-sm"}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* タイトル */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">
          タイトル <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 検索結果の並び順がおかしい"
          className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* 詳細 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">
          詳細 <span className="text-red-400">*</span>
        </label>
        <textarea
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={compact ? 4 : 6}
          placeholder="具体的な状況・再現手順・要望の背景などを記入してください。"
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none leading-relaxed"
        />
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || !title.trim() || !body.trim()}
        className="h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        送信する
      </button>
    </form>
  );
}
