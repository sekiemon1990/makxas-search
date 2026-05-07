"use client";

import { useState } from "react";
import { Bot, X, MessageSquare, MessageSquarePlus } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { FeedbackForm } from "./FeedbackForm";

type Tab = "chat" | "feedback";

type Props = {
  systemExtra?: string;
  pageContext?: string;
};

export function FloatingWidget({ systemExtra, pageContext }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [chatKey, setChatKey] = useState(0);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* パネル */}
      {open && (
        <div
          className="w-[360px] h-[520px] bg-surface border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ animation: "slideUpFade 0.18s ease-out" }}
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">
                AIアシスタント
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full text-muted hover:bg-surface-2 flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>

          {/* タブ */}
          <div className="flex border-b border-border shrink-0">
            <button
              type="button"
              onClick={() => setTab("chat")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === "chat"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <MessageSquare size={12} />
              チャット
            </button>
            <button
              type="button"
              onClick={() => setTab("feedback")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === "feedback"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <MessageSquarePlus size={12} />
              フィードバック
            </button>
          </div>

          {/* コンテンツ */}
          <div className="flex-1 overflow-hidden">
            {tab === "chat" && (
              <ChatPanel
                key={chatKey}
                pageContext={pageContext}
                systemExtra={systemExtra}
                fixedHeight="100%"
                initialMessage="こんにちは！管理データについて何でも聞いてください。検索ログ・コスト・エラー状況などを調べられます。"
                resetKey={chatKey}
              />
            )}
            {tab === "feedback" && (
              <div className="overflow-y-auto h-full p-4">
                <FeedbackForm
                  compact
                  onSent={() => {
                    setTimeout(() => setTab("chat"), 4500);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* トリガーボタン */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setChatKey((k) => k + 1); // 開くたびにリセット
        }}
        className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="AIアシスタントを開く"
      >
        {open ? <X size={22} /> : <Bot size={22} />}
      </button>

      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );
}
