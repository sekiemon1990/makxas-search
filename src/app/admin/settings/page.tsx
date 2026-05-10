"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  TrendingDown,
  CheckCircle2,
  Loader2,
  Tag,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
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
// 知識ファイルアップロード（再利用コンポーネント）
// categoryId: null = 全体共通、string = カテゴリ固有
// ─────────────────────────────────────────────

type KnowledgeFile = {
  id: string;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  extracted_text: string | null;
  created_at: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function KnowledgeFileUpload({
  categoryId,
  compact = false,
}: {
  categoryId: string | null;
  compact?: boolean;
}) {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  async function fetchFiles() {
    const supabase = createClient();
    const query = supabase
      .from("mikomiku_knowledge_files")
      .select("id, filename, storage_path, mime_type, size_bytes, extracted_text, created_at")
      .order("created_at", { ascending: false });

    const { data } = categoryId === null
      ? await query.is("category_id", null)
      : await query.eq("category_id", categoryId);

    if (data) setFiles(data as KnowledgeFile[]);
    setLoading(false);
  }

  useEffect(() => {
    // 非同期IIFEで実行（awaitの後にのみsetStateを呼ぶ）
    (async () => {
      const supabase = createClient();
      const query = supabase
        .from("mikomiku_knowledge_files")
        .select("id, filename, storage_path, mime_type, size_bytes, extracted_text, created_at")
        .order("created_at", { ascending: false });

      const { data } = categoryId === null
        ? await query.is("category_id", null)
        : await query.eq("category_id", categoryId);

      if (data) setFiles(data as KnowledgeFile[]);
      setLoading(false);
    })();
  }, [categoryId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    const supabase = createClient();

    for (const file of Array.from(selectedFiles)) {
      try {
        const storagePath = `${Date.now()}-${file.name}`;

        const { error: storageError } = await supabase.storage
          .from("mikomiku-knowledge")
          .upload(storagePath, file);

        if (storageError) {
          console.error("[knowledge] storage upload error:", storageError);
          continue;
        }

        let extractedText: string | null = null;
        try {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/admin/extract-text", {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const json = await res.json();
            extractedText = json.text ?? null;
          }
        } catch (extractErr) {
          console.error("[knowledge] text extraction error:", extractErr);
        }

        const insertData: Record<string, unknown> = {
          filename: file.name,
          storage_path: storagePath,
          mime_type: file.type,
          size_bytes: file.size,
          extracted_text: extractedText,
          created_at: new Date().toISOString(),
        };
        if (categoryId !== null) {
          insertData.category_id = categoryId;
        }

        await supabase.from("mikomiku_knowledge_files").insert(insertData);
      } catch (err) {
        console.error("[knowledge] upload error:", err);
      }
    }

    e.target.value = "";
    setUploading(false);
    await fetchFiles();
  }

  async function deleteFile(file: KnowledgeFile) {
    setDeletingIds((prev) => new Set(prev).add(file.id));
    const supabase = createClient();
    await supabase.storage.from("mikomiku-knowledge").remove([file.storage_path]);
    await supabase.from("mikomiku_knowledge_files").delete().eq("id", file.id);
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(file.id);
      return next;
    });
    await fetchFiles();
  }

  return (
    <div className="flex flex-col gap-2">
      {/* アップロードエリア */}
      <div className="relative">
        <label
          className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors ${
            compact ? "p-3" : "p-6"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 size={compact ? 14 : 20} className="animate-spin text-primary" />
              <span className="text-xs text-muted">アップロード中...</span>
            </>
          ) : (
            <>
              <Plus size={compact ? 14 : 20} className="text-muted" />
              <span className={`${compact ? "text-xs" : "text-sm"} text-foreground font-medium`}>
                ファイルを選択またはドロップ
              </span>
              {!compact && (
                <span className="text-xs text-muted">
                  対応形式: PDF, TXT, CSV, MD, JSON, PNG, JPG
                </span>
              )}
            </>
          )}
          <input
            type="file"
            multiple
            accept=".pdf,.txt,.csv,.md,.json,.png,.jpg,.jpeg,.webp"
            onChange={handleFileChange}
            disabled={uploading}
            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
        </label>
      </div>

      {/* ファイル一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-2">
          <Loader2 size={13} className="animate-spin text-muted" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted text-center py-1">ファイルなし</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-surface-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{file.filename}</p>
                <p className="text-xs text-muted mt-0.5">
                  {formatBytes(file.size_bytes)} ·{" "}
                  {file.extracted_text != null ? (
                    <span className="text-green-600">テキスト抽出済み</span>
                  ) : (
                    <span className="text-muted">画像のみ</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteFile(file)}
                disabled={deletingIds.has(file.id)}
                className="p-1 rounded hover:bg-red-50 hover:text-red-500 text-muted transition-colors disabled:opacity-50"
                title="削除"
              >
                {deletingIds.has(file.id) ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// カテゴリ別見込金額ロジック設定セクション
// ─────────────────────────────────────────────

type Category = {
  id: string;
  name: string;
  level: "major" | "minor";
  major_id: string | null;
  prompt: string;
  sort_order: number;
};

function CategoryPromptsSection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMajors, setOpenMajors] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [newMajorName, setNewMajorName] = useState("");
  const [newMinorNames, setNewMinorNames] = useState<Record<string, string>>({});
  const [addingMajor, setAddingMajor] = useState(false);
  const [addingMinorIds, setAddingMinorIds] = useState<Set<string>>(new Set());
  const [localPrompts, setLocalPrompts] = useState<Record<string, string>>({});

  async function fetchCategories() {
    const supabase = createClient();
    const { data } = await supabase
      .from("mikomiku_categories")
      .select("id, name, level, major_id, prompt, sort_order")
      .order("sort_order");
    if (data) {
      setCategories(data as Category[]);
      const prompts: Record<string, string> = {};
      for (const c of data as Category[]) {
        prompts[c.id] = c.prompt ?? "";
      }
      setLocalPrompts(prompts);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("mikomiku_categories")
        .select("id, name, level, major_id, prompt, sort_order")
        .order("sort_order");
      if (data) {
        setCategories(data as Category[]);
        const prompts: Record<string, string> = {};
        for (const c of data as Category[]) {
          prompts[c.id] = c.prompt ?? "";
        }
        setLocalPrompts(prompts);
      }
      setLoading(false);
    })();
  }, []);

  function toggleMajor(id: string) {
    setOpenMajors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function savePrompt(cat: Category) {
    setSavingIds((prev) => new Set(prev).add(cat.id));
    const supabase = createClient();
    await supabase
      .from("mikomiku_categories")
      .update({ prompt: localPrompts[cat.id] ?? "", updated_at: new Date().toISOString() })
      .eq("id", cat.id);
    setSavingIds((prev) => {
      const next = new Set(prev);
      next.delete(cat.id);
      return next;
    });
    setSavedIds((prev) => new Set(prev).add(cat.id));
    setTimeout(() => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(cat.id);
        return next;
      });
    }, 2000);
    await fetchCategories();
  }

  async function addMajor() {
    const name = newMajorName.trim();
    if (!name) return;
    setAddingMajor(true);
    const supabase = createClient();
    const maxOrder = categories.filter((c) => c.level === "major").reduce((a, c) => Math.max(a, c.sort_order), 0);
    await supabase.from("mikomiku_categories").insert({
      name,
      level: "major",
      major_id: null,
      prompt: "",
      sort_order: maxOrder + 1,
      updated_at: new Date().toISOString(),
    });
    setNewMajorName("");
    setAddingMajor(false);
    await fetchCategories();
  }

  async function addMinor(majorId: string) {
    const name = (newMinorNames[majorId] ?? "").trim();
    if (!name) return;
    setAddingMinorIds((prev) => new Set(prev).add(majorId));
    const supabase = createClient();
    const minors = categories.filter((c) => c.level === "minor" && c.major_id === majorId);
    const maxOrder = minors.reduce((a, c) => Math.max(a, c.sort_order), 0);
    await supabase.from("mikomiku_categories").insert({
      name,
      level: "minor",
      major_id: majorId,
      prompt: "",
      sort_order: maxOrder + 1,
      updated_at: new Date().toISOString(),
    });
    setNewMinorNames((prev) => ({ ...prev, [majorId]: "" }));
    setAddingMinorIds((prev) => {
      const next = new Set(prev);
      next.delete(majorId);
      return next;
    });
    await fetchCategories();
  }

  async function deleteCategory(id: string) {
    const supabase = createClient();
    const cat = categories.find((c) => c.id === id);
    if (cat?.level === "major") {
      await supabase.from("mikomiku_categories").delete().eq("major_id", id);
    }
    await supabase.from("mikomiku_categories").delete().eq("id", id);
    await fetchCategories();
  }

  const majorCategories = categories.filter((c) => c.level === "major");

  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Tag size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          カテゴリ別見込金額ロジック設定
        </h2>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        カテゴリ別に見込金額の算出ロジックと知識ベースを設定します。優先順位: 中カテゴリ &gt; 大カテゴリ &gt; 全体設定。未設定の場合は上位のプロンプト・知識が使用されます。
      </p>

      {loading ? (
        <div className="h-16 flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-muted" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {majorCategories.map((major) => {
            const isOpen = openMajors.has(major.id);
            const minors = categories.filter((c) => c.level === "minor" && c.major_id === major.id);
            return (
              <div key={major.id} className="border border-border rounded-lg overflow-hidden">
                {/* 大カテゴリヘッダー */}
                <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-2">
                  <button
                    type="button"
                    onClick={() => toggleMajor(major.id)}
                    className="flex items-center gap-1.5 flex-1 text-sm font-medium text-foreground hover:text-primary text-left"
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {major.name}
                    <span className="text-xs text-muted font-normal ml-1">
                      ({minors.length}個の中カテゴリ)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCategory(major.id)}
                    className="p-1 rounded hover:bg-red-50 hover:text-red-500 text-muted transition-colors"
                    title="削除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {isOpen && (
                  <div className="p-3 flex flex-col gap-4 border-t border-border">
                    {/* 大カテゴリのプロンプト */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted">大カテゴリ「{major.name}」のロジック</label>
                      <textarea
                        value={localPrompts[major.id] ?? ""}
                        onChange={(e) =>
                          setLocalPrompts((prev) => ({ ...prev, [major.id]: e.target.value }))
                        }
                        rows={4}
                        placeholder="このカテゴリの見込金額算出ロジックを記入（空白の場合は全体設定を使用）"
                        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none leading-relaxed font-mono"
                      />
                      <div className="flex items-center justify-between">
                        {savedIds.has(major.id) ? (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            保存しました
                          </span>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={() => savePrompt(major)}
                          disabled={savingIds.has(major.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                        >
                          {savingIds.has(major.id) && <Loader2 size={11} className="animate-spin" />}
                          保存
                        </button>
                      </div>
                    </div>

                    {/* 大カテゴリ知識ベース */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted flex items-center gap-1">
                        <BookOpen size={11} />
                        「{major.name}」の知識ベース
                      </label>
                      <KnowledgeFileUpload categoryId={major.id} compact />
                    </div>

                    {/* 中カテゴリ一覧 */}
                    {minors.length > 0 && (
                      <div className="flex flex-col gap-3 pl-3 border-l-2 border-border">
                        {minors.map((minor) => (
                          <div key={minor.id} className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-foreground flex-1">
                                中カテゴリ「{minor.name}」
                              </span>
                              <button
                                type="button"
                                onClick={() => deleteCategory(minor.id)}
                                className="p-1 rounded hover:bg-red-50 hover:text-red-500 text-muted transition-colors"
                                title="削除"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <textarea
                              value={localPrompts[minor.id] ?? ""}
                              onChange={(e) =>
                                setLocalPrompts((prev) => ({ ...prev, [minor.id]: e.target.value }))
                              }
                              rows={4}
                              placeholder="このカテゴリの見込金額算出ロジックを記入（空白の場合は大カテゴリの設定を使用）"
                              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none leading-relaxed font-mono"
                            />
                            <div className="flex items-center justify-between">
                              {savedIds.has(minor.id) ? (
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                  <CheckCircle2 size={12} />
                                  保存しました
                                </span>
                              ) : (
                                <span />
                              )}
                              <button
                                type="button"
                                onClick={() => savePrompt(minor)}
                                disabled={savingIds.has(minor.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                              >
                                {savingIds.has(minor.id) && <Loader2 size={11} className="animate-spin" />}
                                保存
                              </button>
                            </div>

                            {/* 中カテゴリ知識ベース */}
                            <div className="flex flex-col gap-1">
                              <label className="text-xs text-muted flex items-center gap-1">
                                <BookOpen size={11} />
                                「{minor.name}」の知識ベース
                              </label>
                              <KnowledgeFileUpload categoryId={minor.id} compact />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 中カテゴリ追加フォーム */}
                    <div className="flex items-center gap-2 pl-3 border-l-2 border-dashed border-border">
                      <input
                        type="text"
                        value={newMinorNames[major.id] ?? ""}
                        onChange={(e) =>
                          setNewMinorNames((prev) => ({ ...prev, [major.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addMinor(major.id);
                        }}
                        placeholder="中カテゴリ名を入力"
                        className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <button
                        type="button"
                        onClick={() => addMinor(major.id)}
                        disabled={addingMinorIds.has(major.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
                      >
                        {addingMinorIds.has(major.id) ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Plus size={11} />
                        )}
                        追加
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* 大カテゴリ追加フォーム */}
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={newMajorName}
              onChange={(e) => setNewMajorName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addMajor();
              }}
              placeholder="大カテゴリ名を入力"
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={addMajor}
              disabled={addingMajor}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {addingMajor ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              大カテゴリ追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 知識ベースセクション（全カテゴリ共通）
// ─────────────────────────────────────────────

function KnowledgeBaseSection() {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BookOpen size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          知識ベース（全カテゴリ共通）
        </h2>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        全カテゴリ共通でClaudeが参照する知識ファイルをアップロードします。PDF・テキスト・CSV・画像など各種形式に対応。
        <br />
        カテゴリ固有の知識は「カテゴリ別見込金額ロジック設定」の各カテゴリ内でアップロードしてください。
      </p>
      <KnowledgeFileUpload categoryId={null} />
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
      <CategoryPromptsSection />
      <KnowledgeBaseSection />
    </div>
  );
}
