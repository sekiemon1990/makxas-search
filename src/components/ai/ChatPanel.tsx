"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, Loader2, AlertCircle, RotateCcw } from "lucide-react";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  pageContext?: string;
  systemExtra?: string;
  fixedHeight?: string;
  initialMessage?: string;
  /** 外部から messages をリセットするためのキー */
  resetKey?: number;
  /** 外部から質問をセットするときに使う ref */
  setInputRef?: React.MutableRefObject<((text: string) => void) | null>;
};

export function ChatPanel({
  pageContext,
  systemExtra,
  fixedHeight = "520px",
  initialMessage,
  resetKey = 0,
  setInputRef,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessage
      ? [{ role: "assistant", content: initialMessage }]
      : [],
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // 外部から input をセットするハンドラを公開
  useEffect(() => {
    if (setInputRef) {
      setInputRef.current = (text: string) => {
        setInput(text);
        textareaRef.current?.focus();
      };
    }
  }, [setInputRef]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          pageContext,
          systemExtra,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `エラー (${res.status})`);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.reply },
      ]);
    } catch {
      setError("通信エラーが発生しました。再度お試しください。");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, pageContext, systemExtra]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div
      className="flex flex-col bg-surface border border-border rounded-xl overflow-hidden"
      style={{ height: fixedHeight }}
    >
      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
            <Bot size={36} className="opacity-30" />
            <p className="text-sm text-center">
              管理データについて何でも聞いてください。
              <br />
              検索ログ・コスト・エラー状況などを調べられます。
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-sm leading-relaxed whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-2 items-start">
              <div className="shrink-0 w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center mt-0.5">
                <Bot size={14} className="text-primary" />
              </div>
              <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm bg-surface-2 text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          ),
        )}

        {/* ローディング */}
        {loading && (
          <div className="flex gap-2 items-center">
            <div className="shrink-0 w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center">
              <Bot size={14} className="text-primary" />
            </div>
            <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-surface-2 text-muted text-sm flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" />
              考え中…
            </div>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div className="flex items-start gap-2 text-red-500 text-xs bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <div className="border-t border-border p-3 flex gap-2 items-end bg-surface">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="質問を入力… (Enter で送信、Shift+Enter で改行)"
          className="flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 leading-relaxed"
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim() || loading}
          className="shrink-0 w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Send size={15} />
          )}
        </button>
      </div>
    </div>
  );
}

/** 会話リセットボタン（ページ上部などに配置） */
export function ChatResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-2 text-xs transition-colors"
    >
      <RotateCcw size={12} />
      会話をリセット
    </button>
  );
}
