"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Sparkles,
  ListChecks,
  Type,
  FileSpreadsheet,
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { read as xlsxRead, utils as xlsxUtils } from "xlsx";
import { addItemsToList, getDefaultQuery, type ListItemQuery } from "@/lib/list";
import { toast } from "@/lib/toast";

type Tab = "text" | "file" | "photo";

type Props = {
  onClose: () => void;
};

// ============================================================
// ユーティリティ: CSV/テキスト解析
// ============================================================

function detectDelimiter(line: string): string {
  const tabCount = (line.match(/\t/g) ?? []).length;
  const commaCount = (line.match(/,/g) ?? []).length;
  if (tabCount >= commaCount && tabCount > 0) return "\t";
  if (commaCount > 0) return ",";
  return "";
}

function parseTextLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type ParsedTable = {
  headers: string[];
  rows: string[][];
};

function parseCsvText(text: string): ParsedTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const delim = detectDelimiter(lines[0]);
  if (!delim) {
    // 区切り文字なし → 1列として扱う
    return {
      headers: ["商品名"],
      rows: lines.map((l) => [l.trim()]),
    };
  }
  const split = (l: string) =>
    l.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
  const firstRow = split(lines[0]);
  // ヘッダー行かどうか簡易判定（数字だけの列が多ければデータ行）
  const allNumeric = firstRow.every((c) => /^\d/.test(c));
  let headers: string[];
  let dataLines: string[];
  if (allNumeric) {
    headers = firstRow.map((_, i) => `列${i + 1}`);
    dataLines = lines;
  } else {
    headers = firstRow;
    dataLines = lines.slice(1);
  }
  const rows = dataLines.map(split);
  return { headers, rows };
}

// ============================================================
// メインコンポーネント
// ============================================================

export function BulkAddModal({ onClose }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("text");

  // --- テキストタブ ---
  const [text, setText] = useState("");

  // --- ファイルタブ ---
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [selectedCol, setSelectedCol] = useState<number>(0);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 写真タブ ---
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  // --- 共通: 確認リスト ---
  const [keywords, setKeywords] = useState<string[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingVal, setEditingVal] = useState("");

  // ============================================================
  // ファイル解析
  // ============================================================
  const handleFileChange = useCallback(
    async (file: File) => {
      setFileError("");
      setTable(null);
      setKeywords([]);
      setFileName(file.name);

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

      if (ext === "xlsx" || ext === "xls") {
        try {
          const buf = await file.arrayBuffer();
          const wb = xlsxRead(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = xlsxUtils.sheet_to_csv(ws);
          const parsed = parseCsvText(raw);
          setTable(parsed);
          setSelectedCol(0);
        } catch {
          setFileError("Excel ファイルの読み込みに失敗しました");
        }
        return;
      }

      if (ext === "csv" || ext === "txt" || ext === "") {
        try {
          const text = await file.text();
          const parsed = parseCsvText(text);
          setTable(parsed);
          setSelectedCol(0);
        } catch {
          setFileError("ファイルの読み込みに失敗しました");
        }
        return;
      }

      setFileError("対応ファイル形式: CSV, Excel (.xlsx/.xls), TXT");
    },
    [],
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileChange(file);
    },
    [handleFileChange],
  );

  // ============================================================
  // 写真解析
  // ============================================================
  const handlePhotoChange = useCallback(async (file: File) => {
    setPhotoError("");
    setKeywords([]);

    // プレビュー
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // base64 に変換して API 送信
    setPhotoLoading(true);
    try {
      const base64Reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        base64Reader.onload = (e) => resolve(e.target?.result as string);
        base64Reader.onerror = reject;
        base64Reader.readAsDataURL(file);
      });

      const res = await fetch("/api/bulk-import/from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });

      const json = await res.json();
      if (!res.ok) {
        setPhotoError(json.error ?? "抽出に失敗しました");
        return;
      }
      setKeywords(json.items ?? []);
    } catch {
      setPhotoError("通信エラーが発生しました");
    } finally {
      setPhotoLoading(false);
    }
  }, []);

  // ============================================================
  // 確認リスト構築
  // ============================================================
  function buildKeywordsFromTab(): string[] {
    if (tab === "text") return parseTextLines(text);
    if (tab === "file" && table) {
      return table.rows
        .map((row) => row[selectedCol] ?? "")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return keywords; // photo
  }

  function handlePreview() {
    const kws = buildKeywordsFromTab();
    setKeywords(kws);
    if (tab !== "photo") {
      // photo タブはAPIが完了した時点で keywords がセットされる
    }
  }

  // ============================================================
  // 追加実行
  // ============================================================
  function handleSubmit() {
    const kws =
      keywords.length > 0 ? keywords : buildKeywordsFromTab();
    if (kws.length === 0) return;
    const defaults = getDefaultQuery();
    const queries: ListItemQuery[] = kws.map((kw) => ({
      keyword: kw,
      excludes: defaults.excludes?.trim() || undefined,
      period: defaults.period,
      sources: defaults.sources,
      conditions: defaults.conditions,
      shipping: defaults.shipping,
    }));
    addItemsToList(queries);
    toast({
      message: `${queries.length}件をリストに追加`,
      actionLabel: "リストを見る",
      actionHref: "/list",
    });
    onClose();
    router.push("/list");
  }

  // ============================================================
  // 確認リストの件数
  // ============================================================
  const previewCount =
    keywords.length > 0
      ? keywords.length
      : tab === "text"
        ? parseTextLines(text).length
        : tab === "file" && table
          ? table.rows.filter((r) => (r[selectedCol] ?? "").trim()).length
          : 0;

  // ============================================================
  // レンダリング
  // ============================================================

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 anim-fade-in flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="anim-slide-up w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl border border-border flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              複数商品をまとめて検索
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="w-8 h-8 rounded-full text-muted hover:bg-surface-2 flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-border bg-surface">
          {(
            [
              { key: "text", icon: <Type size={13} />, label: "テキスト" },
              {
                key: "file",
                icon: <FileSpreadsheet size={13} />,
                label: "ファイル",
              },
              { key: "photo", icon: <Camera size={13} />, label: "写真" },
            ] as { key: Tab; icon: React.ReactNode; label: string }[]
          ).map(({ key, icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setKeywords([]);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
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

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {/* ===== テキストタブ ===== */}
          {tab === "text" && (
            <>
              <p className="text-xs text-muted leading-relaxed">
                商品名を1行1件で入力してください。
              </p>
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setKeywords([]);
                }}
                rows={8}
                placeholder={`例:\nROLEX サブマリーナ\nヴィトン ネヴァーフルMM\niPhone 15 Pro 256GB\nダイソン V12`}
                className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted text-sm font-mono leading-relaxed focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                autoFocus
              />
            </>
          )}

          {/* ===== ファイルタブ ===== */}
          {tab === "file" && (
            <>
              <p className="text-xs text-muted leading-relaxed">
                CSV・Excel・TXT ファイルをアップロードしてください。
                <br />
                商品名が入っている列を選択すると抽出されます。
              </p>

              {/* ドロップゾーン */}
              <div
                onDrop={handleFileDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/60 hover:bg-surface-2 transition-colors"
              >
                <Upload size={24} className="text-muted" />
                <p className="text-sm text-foreground font-medium">
                  {fileName || "ファイルをドロップまたはタップして選択"}
                </p>
                <p className="text-[11px] text-muted">
                  CSV / Excel (.xlsx, .xls) / TXT 対応
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileChange(f);
                  }}
                />
              </div>

              {fileError && (
                <div className="flex items-center gap-2 text-red-500 text-xs">
                  <AlertCircle size={13} />
                  {fileError}
                </div>
              )}

              {/* 列選択 */}
              {table && table.headers.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted">商品名が入っている列を選択：</p>
                  <div className="relative">
                    <select
                      value={selectedCol}
                      onChange={(e) => {
                        setSelectedCol(Number(e.target.value));
                        setKeywords([]);
                      }}
                      className="w-full appearance-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground pr-8 focus:outline-none focus:border-primary"
                    >
                      {table.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `列${i + 1}`}（例: {table.rows[0]?.[i] ?? ""}）
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                    />
                  </div>
                </div>
              )}

              {/* プレビュー件数 */}
              {table && (
                <div className="bg-surface-2 rounded-lg p-3 flex items-center gap-2">
                  <ListChecks size={14} className="text-primary" />
                  <span className="text-sm text-foreground">
                    <span className="font-bold">{previewCount}</span>
                    <span className="text-xs text-muted ml-1">件が検出されました</span>
                  </span>
                </div>
              )}
            </>
          )}

          {/* ===== 写真タブ ===== */}
          {tab === "photo" && (
            <>
              <p className="text-xs text-muted leading-relaxed">
                在庫表・棚卸し表の写真、または商品の写真をアップロードすると
                AI が商品名を自動抽出します。
              </p>

              <div
                onClick={() => photoInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/60 hover:bg-surface-2 transition-colors"
              >
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreview}
                    alt="プレビュー"
                    className="max-h-40 rounded-lg object-contain"
                  />
                ) : (
                  <>
                    <Camera size={28} className="text-muted" />
                    <p className="text-sm text-foreground font-medium">
                      写真をタップして選択
                    </p>
                    <p className="text-[11px] text-muted">
                      JPEG / PNG / WEBP 対応・カメラ撮影も可
                    </p>
                  </>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoChange(f);
                  }}
                />
              </div>

              {photoLoading && (
                <div className="flex items-center gap-2 text-primary text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  AI が商品名を抽出中...
                </div>
              )}

              {photoError && (
                <div className="flex items-center gap-2 text-red-500 text-xs">
                  <AlertCircle size={13} />
                  {photoError}
                </div>
              )}

              {!photoLoading && keywords.length > 0 && (
                <div className="flex items-center gap-2 text-green-600 text-xs">
                  <CheckCircle2 size={13} />
                  {keywords.length}件の商品名を抽出しました。下で確認・編集できます。
                </div>
              )}
            </>
          )}

          {/* ===== 確認リスト（テキスト以外 or プレビュー後） ===== */}
          {keywords.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted font-medium">
                  追加する商品名（タップで編集・削除可）
                </p>
                <span className="text-xs text-muted">{keywords.length}件</span>
              </div>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2">
                {keywords.map((kw, i) =>
                  editingIdx === i ? (
                    <div key={i} className="flex gap-1">
                      <input
                        autoFocus
                        value={editingVal}
                        onChange={(e) => setEditingVal(e.target.value)}
                        onBlur={() => {
                          const next = [...keywords];
                          const v = editingVal.trim();
                          if (v) next[i] = v;
                          else next.splice(i, 1);
                          setKeywords(next);
                          setEditingIdx(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            setEditingIdx(null);
                          }
                        }}
                        className="flex-1 text-sm px-2 py-1 rounded border border-primary bg-surface text-foreground focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="flex items-center gap-2 group px-2 py-1.5 rounded hover:bg-surface"
                    >
                      <span className="flex-1 text-sm text-foreground truncate">
                        {kw}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdx(i);
                          setEditingVal(kw);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-muted hover:text-foreground p-0.5"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...keywords];
                          next.splice(i, 1);
                          setKeywords(next);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-500 p-0.5"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {/* テキスト件数表示 */}
          {tab === "text" && keywords.length === 0 && (
            <div className="bg-surface-2 rounded-lg p-3 flex items-center gap-2">
              <ListChecks size={14} className="text-primary" />
              <span className="text-sm text-foreground">
                <span className="font-bold">{previewCount}</span>
                <span className="text-xs text-muted ml-1">件が入力されています</span>
              </span>
            </div>
          )}

          <p className="text-[11px] text-muted leading-relaxed">
            ※ クイック追加バーで設定された検索条件が適用されます。
          </p>
        </div>

        {/* フッター */}
        <div className="p-4 border-t border-border flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="tap-scale flex-1 h-11 rounded-lg border border-border text-foreground text-sm hover:bg-surface-2"
          >
            キャンセル
          </button>

          {/* ファイルタブ: プレビューボタン（まだ keywords が空の場合） */}
          {tab === "file" && table && keywords.length === 0 && (
            <button
              type="button"
              onClick={handlePreview}
              className="tap-scale flex-1 h-11 rounded-lg bg-surface-2 border border-border text-foreground text-sm font-medium hover:bg-surface"
            >
              内容を確認
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={previewCount === 0 && keywords.length === 0}
            className="tap-scale flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {(keywords.length > 0 ? keywords.length : previewCount)}件を一括検索
          </button>
        </div>
      </div>
    </div>
  );
}
