"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import {
  Plus,
  Trash2,
  X,
  ChevronRight,
  ListChecks,
  Loader2,
  AlertCircle,
  Inbox,
  ChevronDown,
  Pencil,
  WifiOff,
  Wifi,
  StickyNote,
} from "lucide-react";
import {
  useOfflineQueue,
  removeFromOfflineQueue,
  clearOfflineQueue,
} from "@/lib/offline-queue";
import { AppShell } from "@/components/AppShell";
import { PlatformLogo } from "@/components/PlatformLogo";
import { QuickAddBar } from "@/components/QuickAddBar";
import { SOURCES, type SourceKey } from "@/lib/types";
import { formatYen } from "@/lib/utils";
import {
  useCurrentList,
  removeItem,
  cancelItem,
  clearCurrentList,
  saveCurrentAndCreateNew,
  addItemToList,
  updateItemNotes,
  type ListItem,
} from "@/lib/list";
import { ListPicker } from "@/components/ListPicker";
import { RenameListModal } from "@/components/RenameListModal";
import { toast } from "@/lib/toast";
import { ShareButton } from "@/components/share/ShareButton";

export default function ListPage() {
  const list = useCurrentList();
  const [confirmClear, setConfirmClear] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const running = list.items.filter((i) => i.status === "running");
  const queued = list.items.filter((i) => i.status === "queued");
  const completed = list.items.filter((i) => i.status === "completed");
  const failed = list.items.filter(
    (i) => i.status === "error" || i.status === "cancelled"
  );

  const total = completed.reduce(
    (s, i) => s + (i.result?.suggestedBuyPrice ?? 0),
    0
  );

  function saveAndNew() {
    saveCurrentAndCreateNew();
    toast({
      message: "現在のリストを残して新しいリストに切替えました",
    });
  }

  function reset() {
    clearCurrentList();
    setConfirmClear(false);
    toast({ message: "リストをクリアしました" });
  }

  return (
    <AppShell title="査定リスト">
      <div className="flex flex-col gap-4">
        <OfflineQueueBanner />
        <section>
          <div className="bg-surface border border-border rounded-xl flex items-stretch overflow-hidden">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label="リストを切替"
              className="tap-scale flex items-center gap-3 flex-1 min-w-0 p-3 hover:bg-surface-2 text-left"
            >
              <ListChecks size={20} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {list.name ?? "査定リスト"}
                </p>
                <p className="text-[11px] text-muted">
                  {list.items.length}件
                  {list.items.length > 0 && " ・ タップで切替"}
                </p>
              </div>
              <ChevronDown size={16} className="text-muted shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => setRenameOpen(true)}
              aria-label="リスト名を変更"
              className="tap-scale shrink-0 px-3 border-l border-border text-muted hover:text-primary hover:bg-surface-2 flex items-center justify-center"
            >
              <Pencil size={16} />
            </button>
          </div>
        </section>

        <QuickAddBar />

        {list.items.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-8 text-center">
            <Inbox className="text-muted mx-auto mb-3" size={36} />
            <p className="text-sm font-semibold text-foreground mb-1">
              査定リストは空です
            </p>
            <p className="text-xs text-muted leading-relaxed">
              「商品を追加」または「一括入力」から検索を始めましょう。
              <br />
              通常検索の結果画面からも追加できます。
            </p>
          </div>
        ) : (
          <>
            {(running.length > 0 || queued.length > 0) && (
              <section>
                <SectionHeader
                  icon={<Loader2 size={14} className="animate-spin" />}
                  label={`進行中 (${running.length + queued.length})`}
                  color="var(--primary)"
                />
                <div className="flex flex-col gap-2">
                  {running.map((item) => (
                    <RunningCard key={item.id} item={item} />
                  ))}
                  {queued.map((item) => (
                    <QueuedCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}

            {completed.length > 0 && (
              <section>
                <SectionHeader
                  icon={
                    <span className="text-success text-base leading-none">
                      ✓
                    </span>
                  }
                  label={`完了 (${completed.length})`}
                  color="var(--success)"
                />
                <div className="flex flex-col gap-2">
                  {completed.map((item) => (
                    <CompletedCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}

            {failed.length > 0 && (
              <section>
                <SectionHeader
                  icon={<AlertCircle size={14} />}
                  label={`エラー・中止 (${failed.length})`}
                  color="var(--danger)"
                />
                <div className="flex flex-col gap-2">
                  {failed.map((item) => (
                    <FailedCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}

            {completed.length > 0 && (
              <section className="bg-gradient-to-br from-primary to-accent text-primary-foreground rounded-xl p-5 mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs opacity-90">
                    合計推奨買取額（{completed.length}件）
                  </span>
                  <span className="text-[10px] opacity-75">
                    中央値 × 70% で算出
                  </span>
                </div>
                <div className="text-3xl font-bold tracking-tight">
                  {formatYen(total)}
                </div>
              </section>
            )}

            <section className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={saveAndNew}
                className="tap-scale h-12 rounded-lg bg-surface border border-border text-foreground font-medium text-sm flex items-center justify-center gap-1.5 hover:border-foreground/30"
              >
                <Plus size={14} />
                新しいリスト
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="tap-scale h-12 rounded-lg bg-surface border border-border text-foreground font-medium text-sm flex items-center justify-center gap-1.5 hover:border-foreground/30"
              >
                <Trash2 size={14} />
                このリストをクリア
              </button>
            </section>

            {/* 共有ボタン */}
            <div className="flex justify-center pt-1">
              <ShareButton
                resourceType="list"
                resourceId={list.id}
                allowEdit={true}
                className="tap-scale w-full h-10 text-sm justify-center"
              />
            </div>
          </>
        )}
      </div>

      {pickerOpen && <ListPicker onClose={() => setPickerOpen(false)} />}

      {renameOpen && (
        <RenameListModal list={list} onClose={() => setRenameOpen(false)} />
      )}

      {confirmClear && (
        <ConfirmDialog
          title="リストをクリアしますか？"
          body="現在の査定リストを破棄します。保存していない検索は失われます。"
          onConfirm={reset}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </AppShell>
  );
}

function SectionHeader({
  icon,
  label,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2 px-1">
      <span style={{ color }}>{icon}</span>
      <span className="text-xs font-semibold text-foreground">{label}</span>
    </div>
  );
}

function RunningCard({ item }: { item: ListItem }) {
  return (
    <article className="bg-surface border-2 border-primary/30 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Loader2 size={14} className="animate-spin text-primary shrink-0" />
          <p className="text-sm font-medium text-foreground truncate">
            {item.query.keyword}
          </p>
        </div>
        <button
          type="button"
          onClick={() => cancelItem(item.id)}
          aria-label="中止"
          className="shrink-0 w-8 h-8 rounded-md text-muted hover:bg-surface-2 flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>
      <div className="relative h-2 bg-surface-2 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-primary transition-all duration-200"
          style={{ width: `${item.progress}%` }}
        />
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted">
        {item.query.sources.map((s) => (
          <span key={s} className="inline-flex items-center gap-0.5">
            <PlatformLogo source={s} size={10} />
            {SOURCES.find((x) => x.key === s)?.shortName}
          </span>
        ))}
        <span className="ml-auto">
          直近
          {item.query.period === "all" ? "全期間" : `${item.query.period}日`}
        </span>
      </div>
    </article>
  );
}

function QueuedCard({ item }: { item: ListItem }) {
  return (
    <article className="bg-surface border border-border rounded-xl p-3 opacity-70">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-muted">⌛</span>
          <p className="text-sm font-medium text-foreground truncate">
            {item.query.keyword}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted">待機中</span>
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            aria-label="削除"
            className="w-8 h-8 rounded-md text-muted hover:bg-surface-2 flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

function CompletedCard({ item }: { item: ListItem }) {
  if (!item.result) return null;
  const r = item.result;
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(item.notes ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const params = new URLSearchParams({
    keyword: item.query.keyword,
    period: item.query.period,
    sources: item.query.sources.join(","),
    ...(item.query.excludes && { excludes: item.query.excludes }),
    ...(item.query.conditions.length > 0 && {
      conditions: item.query.conditions.join(","),
    }),
    ...(item.query.shipping !== "any" && { shipping: item.query.shipping }),
  });
  const detailHref = `/search/result/list_${item.id}?${params.toString()}`;

  async function handleNoteSave() {
    setSaving(true);
    await updateItemNotes(item.id, noteText);
    setSaving(false);
    setNoteOpen(false);
    toast({ message: "メモを保存しました" });
  }

  return (
    <article className="bg-surface border border-border rounded-xl overflow-hidden">
      <Link href={detailHref} className="block p-3 tap-scale hover:border-primary/40 transition-colors">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-sm font-semibold text-foreground line-clamp-1">
            {item.query.keyword}
          </p>
          <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
            {item.query.sources.map((s) => (
              <PlatformLogo key={s} source={s} size={14} />
            ))}
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xl font-bold text-foreground">
            {formatYen(r.median)}
          </span>
          <span className="text-[10px] text-muted">中央値</span>
          <span className="text-[10px] text-muted">・ {r.count}件</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">
            推奨買取
            <span className="ml-1 font-bold text-success">
              {formatYen(r.suggestedBuyPrice)}
            </span>
          </span>
          <span className="text-[10px] text-muted">
            {formatYen(r.min)} 〜 {formatYen(r.max)}
          </span>
        </div>
      </Link>

      {/* メモ表示 */}
      {item.notes && !noteOpen && (
        <div
          className="px-3 py-2 border-t border-border bg-warning/5 flex items-start gap-1.5 cursor-pointer"
          onClick={() => { setNoteOpen(true); setTimeout(() => textareaRef.current?.focus(), 50); }}
        >
          <StickyNote size={12} className="text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-muted line-clamp-2">{item.notes}</p>
        </div>
      )}

      {/* メモ編集エリア */}
      {noteOpen && (
        <div className="border-t border-border p-2 bg-surface-2">
          <textarea
            ref={textareaRef}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="付属品なし / 液晶割れあり / 動作確認済み など"
            rows={3}
            className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted resize-none focus:outline-none focus:border-primary"
          />
          <div className="flex gap-2 mt-1.5">
            <button
              type="button"
              onClick={handleNoteSave}
              disabled={saving}
              className="flex-1 h-8 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={() => { setNoteOpen(false); setNoteText(item.notes ?? ""); }}
              className="flex-1 h-8 rounded-lg border border-border text-xs text-muted"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 border-t border-border">
        <Link
          href={detailHref}
          className="flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-foreground hover:bg-surface-2 border-r border-border"
        >
          詳細
          <ChevronRight size={12} />
        </Link>
        <button
          type="button"
          onClick={() => { setNoteOpen(true); setTimeout(() => textareaRef.current?.focus(), 50); }}
          className={`flex items-center justify-center gap-1 py-2.5 text-xs border-r border-border hover:bg-surface-2 ${item.notes ? "text-warning" : "text-muted"}`}
        >
          <StickyNote size={12} />
          メモ
        </button>
        <button
          type="button"
          onClick={() => {
            removeItem(item.id);
            toast({ message: "リストから削除しました" });
          }}
          className="flex items-center justify-center gap-1 py-2.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-danger"
        >
          <Trash2 size={12} />
          削除
        </button>
      </div>
    </article>
  );
}

function FailedCard({ item }: { item: ListItem }) {
  return (
    <article className="bg-danger/5 border border-danger/30 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertCircle size={14} className="text-danger shrink-0" />
          <p className="text-sm font-medium text-foreground truncate">
            {item.query.keyword}
          </p>
        </div>
        <button
          type="button"
          onClick={() => removeItem(item.id)}
          aria-label="削除"
          className="shrink-0 w-8 h-8 rounded-md text-muted hover:bg-surface-2 flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>
      <p className="text-xs text-muted">
        {item.status === "cancelled" ? "中止されました" : "検索エラー"}
      </p>
    </article>
  );
}

function ConfirmDialog({
  title,
  body,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 anim-fade-in flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="anim-slide-up max-w-sm w-full bg-surface rounded-2xl shadow-xl border border-border p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <p className="text-sm text-muted mt-2 leading-relaxed">{body}</p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="tap-scale h-11 rounded-lg border border-border text-foreground text-sm hover:bg-surface-2"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="tap-scale h-11 rounded-lg bg-danger text-white text-sm font-semibold hover:bg-danger/90"
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}

function OfflineQueueBanner() {
  const { items, count, isOnline } = useOfflineQueue();

  if (count === 0 && isOnline) return null;

  if (count === 0 && !isOnline) {
    return (
      <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 flex items-center gap-2 text-xs text-foreground">
        <WifiOff size={14} className="text-warning shrink-0" />
        <span>オフライン中: 検索を実行すると保留キューに追加されます</span>
      </div>
    );
  }

  async function runOne(id: string) {
    const target = items.find((q) => q.id === id);
    if (!target) return;
    const added = await addItemToList(target.query);
    if (added) {
      removeFromOfflineQueue(id);
      toast({ message: "保留検索を実行しました" });
    } else {
      toast({ message: "実行に失敗しました", variant: "error" });
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi size={14} className="text-primary" />
          ) : (
            <WifiOff size={14} className="text-warning" />
          )}
          <span className="text-sm font-semibold text-foreground">
            保留中の検索 {count} 件
          </span>
          {!isOnline && (
            <span className="text-[10px] text-warning">オフライン</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            clearOfflineQueue();
            toast({ message: "保留キューをクリアしました" });
          }}
          className="text-[11px] text-muted hover:text-foreground"
        >
          全て削除
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {items.slice(0, 6).map((q) => (
          <li
            key={q.id}
            className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-surface-2"
          >
            <span className="flex-1 truncate text-foreground">
              {q.query.keyword}
            </span>
            {isOnline && (
              <button
                type="button"
                onClick={() => runOne(q.id)}
                className="text-[10px] text-primary hover:underline shrink-0"
              >
                今すぐ実行
              </button>
            )}
            <button
              type="button"
              onClick={() => removeFromOfflineQueue(q.id)}
              aria-label="削除"
              className="text-muted hover:text-foreground shrink-0"
            >
              <X size={12} />
            </button>
          </li>
        ))}
        {items.length > 6 && (
          <li className="text-[10px] text-muted px-2">
            ほか {items.length - 6} 件...
          </li>
        )}
      </ul>
      {isOnline && count > 0 && (
        <p className="text-[10px] text-muted">
          オンラインに戻ったので自動実行中...
        </p>
      )}
    </div>
  );
}
