"use client";

import { useState, useRef } from "react";
import { Bot, MessageSquare, MessageSquarePlus, RotateCcw } from "lucide-react";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { FeedbackForm } from "@/components/ai/FeedbackForm";

type Tab = "chat" | "feedback";

const EXAMPLE_QUESTIONS = [
  "直近7日間の検索件数とエラー率を教えて",
  "今月のAPIコストはいくら？",
  "最近エラーになった検索を調べて",
  "「ロレックス」を含む検索ログを見せて",
  "ユーザーがよく検索しているキーワードは？",
  "エラー率が高い時間帯はある？",
];

export default function AdminAiPage() {
  const [tab, setTab] = useState<Tab>("chat");
  const [chatKey, setChatKey] = useState(0);
  const setInputRef = useRef<((text: string) => void) | null>(null);

  return (
    <div className="p-6 flex flex-col gap-6 max-w-5xl">
      {/* ページヘッダー */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bot size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">AIアシスタント</h1>
          <p className="text-xs text-muted">
            検索ログ・コスト・エラーなど管理データについて質問できます
          </p>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-border">
        {(
          [
            { key: "chat", icon: <MessageSquare size={14} />, label: "AIチャット" },
            {
              key: "feedback",
              icon: <MessageSquarePlus size={14} />,
              label: "フィードバック送信",
            },
          ] as { key: Tab; icon: React.ReactNode; label: string }[]
        ).map(({ key, icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* チャットタブ */}
      {tab === "chat" && (
        <div className="flex gap-5 items-start">
          {/* メインチャット */}
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setChatKey((k) => k + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-2 text-xs transition-colors"
              >
                <RotateCcw size={12} />
                会話をリセット
              </button>
            </div>
            <ChatPanel
              key={chatKey}
              resetKey={chatKey}
              pageContext="管理画面 / AIアシスタントページ"
              fixedHeight="560px"
              initialMessage="こんにちは！管理データについて何でも聞いてください。検索ログ・APIコスト・エラー状況などをリアルタイムで調べられます。"
              setInputRef={setInputRef}
            />
          </div>

          {/* 質問例 */}
          <div className="w-52 shrink-0 flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">
              質問例
            </p>
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setInputRef.current?.(q)}
                className="text-left text-xs text-muted hover:text-foreground bg-surface-2 hover:bg-surface border border-border rounded-lg px-3 py-2 leading-relaxed transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* フィードバックタブ */}
      {tab === "feedback" && (
        <div className="max-w-xl">
          <div className="bg-surface border border-border rounded-xl p-6">
            <p className="text-sm text-muted mb-5 leading-relaxed">
              バグ・機能要望・改善提案などを送信してください。
              管理画面の「フィードバック一覧」で確認できます。
            </p>
            <FeedbackForm compact={false} />
          </div>
        </div>
      )}
    </div>
  );
}
