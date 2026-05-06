"use client";

import { useTransition } from "react";
import { archiveError, unarchiveError } from "./actions";

export function ArchiveButton({ searchId }: { searchId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => archiveError(searchId))}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-surface-2 text-muted hover:bg-success/10 hover:text-success border border-border transition-colors disabled:opacity-40 whitespace-nowrap"
    >
      {pending ? "処理中…" : "✓ 対処済み"}
    </button>
  );
}

export function UnarchiveButton({ searchId }: { searchId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => unarchiveError(searchId))}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-surface-2 text-muted hover:bg-warning/10 hover:text-warning border border-border transition-colors disabled:opacity-40 whitespace-nowrap"
    >
      {pending ? "処理中…" : "戻す"}
    </button>
  );
}
