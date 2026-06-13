"use client";

// 見込金額ロジック チューニング チャット（マネージャー向け）
//
// 自然言語で見込金額ロジックの変更を依頼 → AIが変更案(before→after)を提示 →
// 「適用」を押すと反映＋履歴記録。AIは確認なしに設定を書き換えない。

import { useState, useEffect, useRef } from "react";
import {
  Send,
  Loader2,
  CheckCircle2,
  History,
  ArrowRight,
  Sparkles,
} from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Proposal = {
  target: "global" | "category";
  categoryId: string | null;
  categoryName: string;
  beforePrompt: string;
  afterPrompt: string;
  summary: string;
};

type HistoryRow = {
  id: string;
  actor_email: string;
  category_name: string | null;
  summary: string;
  created_at: string;
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MikomikuTuningChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadHistory() {
    try {
      const res = await fetch("/api/admin/mikomiku-tuning/apply");
      if (res.ok) {
        const json = await res.json();
        setHistory(json.history ?? []);
      }
    } catch {
      /* 履歴取得失敗は致命的でない */
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, proposal]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setProposal(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/admin/mikomiku-tuning/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || "エラーが発生しました");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.reply },
      ]);
      if (json.proposal) setProposal(json.proposal as Proposal);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSending(false);
    }
  }

  async function apply() {
    if (!proposal || applying) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mikomiku-tuning/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: proposal.target,
          categoryId: proposal.categoryId,
          newPrompt: proposal.afterPrompt,
          summary: proposal.summary,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || "適用に失敗しました");
        return;
      }
      setToast(`「${proposal.categoryName}」に適用しました`);
      setProposal(null);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ 「${proposal.categoryName}」のロジックを更新しました。次回の査定から反映されます。`,
        },
      ]);
      await loadHistory();
      setTimeout(() => setToast(null), 4000);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* チャット本体 */}
      <div className="bg-surface border border-border rounded-xl flex flex-col h-[480px]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Sparkles size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            見込金額ロジック チューニング
          </h2>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="text-xs text-muted leading-relaxed">
              見込金額の算出ロジックを、会話で調整できます。例:
              <ul className="mt-2 flex flex-col gap-1">
                <li className="px-2.5 py-1.5 rounded-lg bg-surface-2">
                  「ブランドバッグは相場が崩れにくいので、見込みを相場の90%まで上げて」
                </li>
                <li className="px-2.5 py-1.5 rounded-lg bg-surface-2">
                  「時計カテゴリは直近の落札に絞って慎重めに見積もって」
                </li>
                <li className="px-2.5 py-1.5 rounded-lg bg-surface-2">
                  「今の全体ロジックを教えて」
                </li>
              </ul>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-foreground"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {/* 変更案カード */}
          {proposal && (
            <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <span>変更案</span>
                <span className="text-muted font-normal">
                  — {proposal.categoryName}
                </span>
              </div>
              <p className="mt-1 text-xs text-foreground font-medium">
                {proposal.summary}
              </p>
              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="rounded-lg bg-surface border border-border p-2.5">
                  <p className="text-[10px] text-muted mb-1">変更前</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {proposal.beforePrompt || "(未設定)"}
                  </p>
                </div>
                <ArrowRight
                  size={16}
                  className="text-primary mx-auto hidden sm:block"
                />
                <div className="rounded-lg bg-surface border border-primary/30 p-2.5">
                  <p className="text-[10px] text-primary mb-1">変更後</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {proposal.afterPrompt}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={apply}
                  disabled={applying}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {applying ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  適用する
                </button>
                <button
                  type="button"
                  onClick={() => setProposal(null)}
                  disabled={applying}
                  className="px-4 py-2 rounded-lg border border-border text-muted text-sm hover:bg-surface-2 disabled:opacity-50"
                >
                  やめる
                </button>
              </div>
            </div>
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-surface-2 px-3.5 py-2">
                <Loader2 size={14} className="animate-spin text-muted" />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="px-4 py-2 text-xs text-red-600 border-t border-border">
            {error}
          </p>
        )}
        {toast && (
          <p className="px-4 py-2 text-xs text-green-600 border-t border-border flex items-center gap-1">
            <CheckCircle2 size={12} />
            {toast}
          </p>
        )}

        {/* 入力 */}
        <div className="flex items-end gap-2 p-3 border-t border-border">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="見込金額ロジックの変更を依頼…（Enterで送信 / Shift+Enterで改行）"
            className="flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 max-h-32"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !input.trim()}
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 shrink-0"
          >
            <Send size={15} />
          </button>
        </div>
      </div>

      {/* 変更履歴 */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <History size={15} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">変更履歴</h3>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted">まだ変更履歴はありません。</p>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-3 text-xs border-b border-border last:border-0 pb-2 last:pb-0"
              >
                <span className="text-muted shrink-0">{fmtTime(h.created_at)}</span>
                <span className="font-medium text-foreground shrink-0">
                  {h.category_name ?? "全体"}
                </span>
                <span className="text-muted truncate flex-1">{h.summary}</span>
                <span className="text-muted shrink-0">{h.actor_email}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
