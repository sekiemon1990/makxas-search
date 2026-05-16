"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChartBar, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  SearchFormFields,
  type Period,
  PERIOD_OPTIONS,
  DEFAULT_PERIOD,
} from "@/components/SearchFormFields";
import { SOURCES, type SourceKey } from "@/lib/types";
import { useLastResultUrl } from "@/lib/storage";
import { ContractedProjectsPanel } from "@/components/core-rails/ContractedProjectsPanel";

const VALID_PERIODS: Period[] = PERIOD_OPTIONS.map((p) => p.v);
const VALID_SOURCES: SourceKey[] = SOURCES.map((s) => s.key);

function SearchContent() {
  const params = useSearchParams();
  const lastResultUrl = useLastResultUrl();

  const periodParam = params.get("period");
  const sourcesParam = params.get("sources");

  const initial = {
    keyword: params.get("keyword") ?? "",
    excludes: params.get("excludes") ?? "",
    period:
      periodParam && VALID_PERIODS.includes(periodParam as Period)
        ? (periodParam as Period)
        : DEFAULT_PERIOD,
    sources: sourcesParam
      ? (sourcesParam.split(",").filter((s) =>
          VALID_SOURCES.includes(s as SourceKey)
        ) as SourceKey[])
      : (["yahoo_auction"] as SourceKey[]),
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="text-xl font-bold text-foreground">相場を検索</h2>
          <p className="text-sm text-muted mt-1">
            選択した媒体から一括で落札相場を取得します
          </p>
        </section>

        {lastResultUrl && (
          <Link
            href={lastResultUrl}
            className="tap-scale flex items-center gap-3 px-4 h-12 rounded-lg bg-primary/5 border-2 border-primary/30 text-primary hover:border-primary/50"
          >
            <ChartBar size={16} className="shrink-0" />
            <span className="text-sm font-semibold flex-1">
              前回の検索結果に戻る
            </span>
            <ChevronRight size={16} className="shrink-0" />
          </Link>
        )}

        <SearchFormFields initial={initial} />

        <section className="mt-2">
          <h3 className="text-sm font-semibold text-foreground mb-2">
            検索のコツ
          </h3>
          <ul className="text-xs text-muted space-y-1 leading-relaxed">
            <li>・ ブランド名・型番をスペース区切りで入れると精度UP</li>
            <li>・ 「ジャンク」「部品取り」を除外すると相場が安定</li>
            <li>・ 媒体を増やすほど取得時間が長くなります</li>
          </ul>
        </section>

        <ContractedProjectsPanel />
      </div>
    </AppShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="pt-8 text-center text-muted text-sm">
            読み込み中...
          </div>
        </AppShell>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
