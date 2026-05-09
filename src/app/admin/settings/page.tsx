"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  TrendingDown,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
            placeholder="例: 主な査定品目はブランドバッグ・時計・貴金属です。"
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
// 見込金額プロンプト設定セクション
// ─────────────────────────────────────────────

function MikomikuPromptSection() {
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
        .eq("key", "mikomiku_prompt")
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
      { key: "mikomiku_prompt", value, updated_at: now },
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
        <TrendingDown size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          見込金額算出ロジック設定
        </h2>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        見込金額の算出ロジックをプロンプトで設定します。
        相場の中央値・最小・最大・件数を元にClaudeが計算します。
        <br />
        未設定の場合は「中央値の70%」をデフォルトとして使用します。
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
            rows={8}
            placeholder={`例:
ヤフオク・メルカリの落札相場から見込金額を計算してください。
・プラットフォーム手数料: 8.8%
・送料目安: 1,000円
・仕入れ利益率: 20%以上確保

計算式: 見込金額 = 中央値 × (1 - 0.088) - 1000円 × (1 - 0.20)
小数点以下は切り捨て、100円単位で丸めてください。`}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none leading-relaxed font-mono text-xs"
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
// ページ本体
// ─────────────────────────────────────────────

export default function AdminSettingsPage() {
  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-foreground">管理設定</h1>
        <p className="text-xs text-muted mt-1">AI・見込金額ロジックの設定</p>
      </div>
      <AiContextSection />
      <MikomikuPromptSection />
    </div>
  );
}
