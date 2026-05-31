"use client";

import { AppShell } from "@/components/AppShell";
import { CustomerSuggester } from "@/components/suggest/CustomerSuggester";

export default function SuggestPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <section>
          <h2 className="text-xl font-bold text-foreground">追加提案サジェスト</h2>
          <p className="text-sm text-muted mt-1">
            顧客属性から高単価商材を優先順に提案します
          </p>
        </section>
        <CustomerSuggester />
      </div>
    </AppShell>
  );
}
