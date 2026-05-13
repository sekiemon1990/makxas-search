"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Plus,
  Search,
  Trash2,
  ChevronRight,
  MapPin,
  Clock,
  TrendingUp,
  Package,
} from "lucide-react";

// ─────────────────────────────────────────────
// デモ用の型
// ─────────────────────────────────────────────

type DemoItem = {
  id: string;
  name: string;
  estimatedLow: number;
  estimatedHigh: number;
  status: "researched" | "pending";
};

type DemoVisit = {
  id: string;
  customerName: string;
  scheduledAt: string;
  address: string;
  items: DemoItem[];
};

// ─────────────────────────────────────────────
// デモデータ
// ─────────────────────────────────────────────

const DEMO_VISITS: DemoVisit[] = [
  {
    id: "1",
    customerName: "田中様",
    scheduledAt: "本日 14:00",
    address: "大阪市北区",
    items: [
      { id: "a", name: "ソニー α7III ボディ", estimatedLow: 55000, estimatedHigh: 70000, status: "researched" },
      { id: "b", name: "ドラゴンクエスト XI S (Switch)", estimatedLow: 1200, estimatedHigh: 1800, status: "researched" },
      { id: "c", name: "iPad Pro 11インチ 第3世代 256GB", estimatedLow: 38000, estimatedHigh: 48000, status: "researched" },
    ],
  },
  {
    id: "2",
    customerName: "山本様",
    scheduledAt: "明日 10:30",
    address: "大阪市中央区",
    items: [
      { id: "d", name: "ブランドバッグ（詳細不明）", estimatedLow: 0, estimatedHigh: 0, status: "pending" },
      { id: "e", name: "時計（ブランド・型番不明）", estimatedLow: 0, estimatedHigh: 0, status: "pending" },
    ],
  },
];

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

function formatPrice(n: number) {
  return n.toLocaleString("ja-JP");
}

function VisitCard({ visit, onClick }: { visit: DemoVisit; onClick: () => void }) {
  const researched = visit.items.filter((i) => i.status === "researched").length;
  const total = visit.items.length;
  const totalLow = visit.items.reduce((s, i) => s + i.estimatedLow, 0);
  const totalHigh = visit.items.reduce((s, i) => s + i.estimatedHigh, 0);
  const ready = researched === total;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 tap-scale hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${ready ? "bg-green-500" : "bg-yellow-400"}`} />
            <span className="font-semibold text-foreground">{visit.customerName}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted">
            <span className="flex items-center gap-1"><Clock size={11} />{visit.scheduledAt}</span>
            <span className="flex items-center gap-1"><MapPin size={11} />{visit.address}</span>
          </div>
        </div>
        <ChevronRight size={16} className="text-muted shrink-0 mt-1" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Package size={12} />
          <span>{researched}/{total}件 リサーチ済</span>
        </div>
        {totalHigh > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <TrendingUp size={12} className="text-primary" />
            <span className="text-foreground font-medium">
              ¥{formatPrice(totalLow)}〜¥{formatPrice(totalHigh)}
            </span>
          </div>
        )}
      </div>

      {/* プログレスバー */}
      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(researched / total) * 100}%` }}
        />
      </div>
    </button>
  );
}

function VisitDetail({ visit, onBack }: { visit: DemoVisit; onBack: () => void }) {
  const totalLow = visit.items.reduce((s, i) => s + i.estimatedLow, 0);
  const totalHigh = visit.items.reduce((s, i) => s + i.estimatedHigh, 0);

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="text-sm text-primary flex items-center gap-1">
        ‹ 一覧に戻る
      </button>

      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2">
        <h2 className="font-bold text-foreground text-lg">{visit.customerName}</h2>
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          <span className="flex items-center gap-1"><Clock size={12} />{visit.scheduledAt}</span>
          <span className="flex items-center gap-1"><MapPin size={12} />{visit.address}</span>
        </div>
        {totalHigh > 0 && (
          <div className="mt-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-muted">買取見込み合計</span>
            <span className="font-bold text-primary">¥{formatPrice(totalLow)}〜¥{formatPrice(totalHigh)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">商品リスト</h3>
          <span className="text-xs text-muted">{visit.items.length}件</span>
        </div>

        {visit.items.map((item) => (
          <div
            key={item.id}
            className="bg-surface border border-border rounded-xl p-3 flex items-center justify-between gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
              {item.status === "researched" ? (
                <p className="text-xs text-primary mt-0.5">
                  ¥{formatPrice(item.estimatedLow)}〜¥{formatPrice(item.estimatedHigh)}
                </p>
              ) : (
                <p className="text-xs text-yellow-500 mt-0.5">リサーチ未完了</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {item.status === "researched" ? (
                <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">済</span>
              ) : (
                <span className="text-xs bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full">未</span>
              )}
              <button
                className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-muted hover:text-primary"
                aria-label="検索"
              >
                <Search size={14} />
              </button>
            </div>
          </div>
        ))}

        <button className="flex items-center gap-2 text-sm text-primary py-2 justify-center border border-dashed border-primary/40 rounded-xl hover:bg-primary/5">
          <Plus size={14} />
          商品を追加
        </button>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 text-xs text-yellow-800 dark:text-yellow-300">
        ⚠️ これはデモ画面です。実際の機能は開発中です。
      </div>
    </div>
  );
}

export default function VisitPage() {
  const [selected, setSelected] = useState<DemoVisit | null>(null);

  return (
    <AppShell title="訪問前リサーチ">
      {selected ? (
        <VisitDetail visit={selected} onBack={() => setSelected(null)} />
      ) : (
        <div className="flex flex-col gap-4">
          <section>
            <h2 className="text-xl font-bold text-foreground">訪問前リサーチ</h2>
            <p className="text-sm text-muted mt-1">
              訪問前に相場を調べておき、現場をスムーズに進めます
            </p>
          </section>

          <div className="flex flex-col gap-3">
            {DEMO_VISITS.map((v) => (
              <VisitCard key={v.id} visit={v} onClick={() => setSelected(v)} />
            ))}
          </div>

          <button className="flex items-center gap-2 text-sm text-primary py-3 justify-center border border-dashed border-primary/40 rounded-xl hover:bg-primary/5">
            <Plus size={16} />
            新しい訪問を追加
          </button>

          <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 text-xs text-yellow-800 dark:text-yellow-300">
            ⚠️ これはデモ画面です。データはサンプルです。
          </div>
        </div>
      )}
    </AppShell>
  );
}
