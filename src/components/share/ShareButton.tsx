"use client";

import { useState } from "react";
import { Share2, Check, ChevronDown } from "lucide-react";
import { toast } from "@/lib/toast";

interface Props {
  resourceType: "search" | "list" | "listing";
  resourceId: string;
  /** リスト共有時のみ表示: view / edit を選択可能にする */
  allowEdit?: boolean;
  className?: string;
}

export function ShareButton({
  resourceType,
  resourceId,
  allowEdit = false,
  className = "",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function createShare(permission: "view" | "edit" = "view") {
    setLoading(true);
    setMenuOpen(false);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          permission,
        }),
      });
      if (!res.ok) throw new Error("失敗");
      const { url } = (await res.json()) as { url: string };
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ message: "共有リンクをコピーしました" });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({ message: "共有リンクの作成に失敗しました", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  // リスト以外 or 編集不要の場合はシンプルなボタン
  if (!allowEdit) {
    return (
      <button
        onClick={() => createShare("view")}
        disabled={loading}
        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors disabled:opacity-50 ${className}`}
      >
        {copied ? (
          <Check size={14} className="text-success" />
        ) : (
          <Share2 size={14} />
        )}
        {copied ? "コピー済み" : "共有"}
      </button>
    );
  }

  // 編集権限を選べるドロップダウン
  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center border border-border rounded-lg overflow-hidden bg-surface">
        <button
          onClick={() => createShare("view")}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 hover:bg-surface-2 transition-colors disabled:opacity-50"
        >
          {copied ? (
            <Check size={14} className="text-success" />
          ) : (
            <Share2 size={14} />
          )}
          {copied ? "コピー済み" : "共有（閲覧）"}
        </button>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          disabled={loading}
          className="px-2 py-1.5 border-l border-border hover:bg-surface-2 transition-colors"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-20 bg-surface border border-border rounded-lg shadow-lg overflow-hidden min-w-[180px]">
            <button
              onClick={() => createShare("view")}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-2 transition-colors"
            >
              <div className="font-medium">閲覧リンクを作成</div>
              <div className="text-xs text-muted">見るだけ</div>
            </button>
            <button
              onClick={() => createShare("edit")}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-2 transition-colors border-t border-border"
            >
              <div className="font-medium">編集リンクを作成</div>
              <div className="text-xs text-muted">査定ステータスを更新可能</div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
